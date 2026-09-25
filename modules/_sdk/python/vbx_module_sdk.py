"""
VBXSystem module worker SDK (httpx).

Core API:
  POST /internal/modules/register          X-Module-Token
  POST /internal/modules/jobs/claim
  POST /internal/modules/jobs/{id}/heartbeat
  POST /internal/modules/jobs/{id}/results

Env:
  VBX_API_INTERNAL_URL  base URL (e.g. http://api:8000)
  VBX_MODULE_TOKEN      shared secret (X-Module-Token)
  VBX_MODULE_TOKEN_<ID> optional per-module token (e.g. VBX_MODULE_TOKEN_SHODAN)
"""

from __future__ import annotations

import logging
import os
import socket
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import httpx

logger = logging.getLogger("vbx.module_sdk")

DEFAULT_TIMEOUT = 30.0
DEFAULT_HEARTBEAT_INTERVAL = 15.0


@dataclass
class ModuleJob:
    id: str
    module_id: str
    target: str
    params: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, data: dict[str, Any]) -> "ModuleJob":
        params = dict(data.get("params") or {})
        target = str(
            params.get("target")
            or params.get("host")
            or params.get("ip")
            or data.get("target")
            or data.get("host")
            or ""
        )
        return cls(
            id=str(data["id"]),
            module_id=str(data.get("module_id") or ""),
            target=target,
            params=params,
            raw=data,
        )


class VbxModuleClient:
    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        module_id: str,
        instance_id: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        capabilities: Optional[list[str]] = None,
        version: str = "0.1.0",
    ) -> None:
        self.base_url = (base_url or os.environ.get("VBX_API_INTERNAL_URL") or "http://api:8000").rstrip(
            "/"
        )
        self.module_id = module_id
        # Prefer per-module token, then shared VBX_MODULE_TOKEN
        per_env = f"VBX_MODULE_TOKEN_{(module_id or '').strip().upper()}"
        self.token = (
            token
            or os.environ.get(per_env)
            or os.environ.get("VBX_MODULE_TOKEN")
            or ""
        )
        self.instance_id = instance_id or os.environ.get("VBX_MODULE_INSTANCE_ID") or _default_instance_id(
            module_id
        )
        self.timeout = timeout
        self.capabilities = list(capabilities or [])
        self.version = version
        self._hb_stop = threading.Event()
        self._hb_thread: Optional[threading.Thread] = None
        self._shodan_key_cache: Optional[str] = None

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.token:
            headers["X-Module-Token"] = self.token
        if self.module_id:
            headers["X-Module-Id"] = self.module_id
        return headers

    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}{path}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict[str, Any]] = None,
        expected: tuple[int, ...] = (200, 201, 202, 204),
    ) -> Optional[dict[str, Any]]:
        url = self._url(path)
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.request(method, url, headers=self._headers(), json=json_body)
        if resp.status_code not in expected:
            body = (resp.text or "")[:500]
            raise RuntimeError(f"{method} {path} -> {resp.status_code}: {body}")
        if resp.status_code == 204 or not resp.content:
            return None
        try:
            data = resp.json()
        except ValueError:
            return None
        return data if isinstance(data, dict) else {"data": data}

    def fetch_runtime_config(self) -> dict[str, Any]:
        """Pull allowlist / non-secret defaults from Core (falls back to empty dict).

        Note: Core no longer returns plaintext Shodan API key here — use
        ``fetch_shodan_api_key`` or env ``VBX_SHODAN_API_KEY`` / docker secret.
        """
        try:
            data = self._request("GET", "/internal/modules/config", expected=(200,))
        except Exception as exc:  # noqa: BLE001
            logger.warning("fetch runtime config failed: %s", exc)
            return {}
        return data if isinstance(data, dict) else {}

    def fetch_shodan_api_key(self, *, force: bool = False) -> str:
        """POST /internal/modules/shodan/api-key (shodan module token only). Cached in memory."""
        if self._shodan_key_cache is not None and not force:
            return self._shodan_key_cache
        env_key = (os.environ.get("VBX_SHODAN_API_KEY") or "").strip()
        if env_key and not force:
            self._shodan_key_cache = env_key
            return env_key
        try:
            data = self._request("POST", "/internal/modules/shodan/api-key", json_body={}, expected=(200,))
        except Exception as exc:  # noqa: BLE001
            logger.warning("fetch shodan api key failed: %s", exc)
            self._shodan_key_cache = env_key
            return env_key
        key = ""
        if isinstance(data, dict):
            key = str(data.get("shodan_api_key") or "").strip()
        self._shodan_key_cache = key or env_key
        return self._shodan_key_cache

    def fetch_credential(self, credential_id: int | str) -> dict[str, Any]:
        """Fetch vault credential (plaintext password) via module token."""
        cid = int(credential_id)
        data = self._request("GET", f"/internal/modules/credentials/{cid}", expected=(200,))
        return data if isinstance(data, dict) else {}

    def register(self, *, meta: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        payload = {
            "id": self.module_id,
            "version": self.version,
            "capabilities": self.capabilities,
        }
        if meta:
            payload["capabilities"] = list(self.capabilities) + [f"meta:{k}" for k in meta]
        return self._request("POST", "/internal/modules/register", json_body=payload) or payload

    def claim_job(self) -> Optional[ModuleJob]:
        payload = {"module_id": self.module_id, "lease_owner": self.instance_id}
        data = self._request(
            "POST",
            "/internal/modules/jobs/claim",
            json_body=payload,
            expected=(200, 201, 204),
        )
        if not data:
            return None
        job_data = data.get("job") if isinstance(data.get("job"), dict) else None
        if not job_data or not job_data.get("id"):
            return None
        return ModuleJob.from_payload(job_data)

    def job_heartbeat(
        self,
        job_id: str,
        *,
        progress: Optional[float] = None,
        message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        prog: dict[str, Any] = {}
        if progress is not None:
            prog["progress"] = progress
        if message is not None:
            prog["message"] = message
        payload: dict[str, Any] = {"lease_owner": self.instance_id, "progress": prog or None}
        return self._request(
            "POST",
            f"/internal/modules/jobs/{job_id}/heartbeat",
            json_body=payload,
            expected=(200, 201, 202, 204),
        )

    def post_results(
        self,
        job_id: str,
        *,
        status: str,
        findings: Optional[list[dict[str, Any]]] = None,
        error: Optional[str] = None,
        raw: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        st = (status or "success").lower()
        if st in {"completed", "succeeded", "ok", "done"}:
            st = "success"
        if st not in {"success", "failed", "running"}:
            st = "success"
        payload: dict[str, Any] = {
            "lease_owner": self.instance_id,
            "status": st,
            "findings": findings or [],
            "error": error or "",
            "progress": {"raw": raw} if raw else None,
        }
        return self._request(
            "POST",
            f"/internal/modules/jobs/{job_id}/results",
            json_body=payload,
            expected=(200, 201, 202, 204),
        )

    def start_heartbeat_loop(
        self,
        *,
        interval_sec: float = DEFAULT_HEARTBEAT_INTERVAL,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> None:
        """Re-register periodically to keep Redis presence / last_seen fresh."""
        if self._hb_thread and self._hb_thread.is_alive():
            return
        self._hb_stop.clear()

        def _loop() -> None:
            while not self._hb_stop.is_set():
                try:
                    self.register()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("module register heartbeat failed: %s", exc)
                    if on_error:
                        try:
                            on_error(exc)
                        except Exception:  # noqa: BLE001
                            pass
                self._hb_stop.wait(interval_sec)

        self._hb_thread = threading.Thread(
            target=_loop, name=f"vbx-hb-{self.module_id}", daemon=True
        )
        self._hb_thread.start()

    def stop_heartbeat_loop(self) -> None:
        self._hb_stop.set()
        if self._hb_thread and self._hb_thread.is_alive():
            self._hb_thread.join(timeout=5.0)
        self._hb_thread = None


def finding_v1(
    *,
    finding_type: str,
    title: str,
    target: str,
    severity: str = "info",
    description: str = "",
    evidence: Optional[dict[str, Any]] = None,
    tags: Optional[list[str]] = None,
    module_id: str = "nmap",
    cve_ids: Optional[list[str]] = None,
    ports: Optional[list] = None,
) -> dict[str, Any]:
    """Build a finding.v1 payload compatible with Core ingest."""
    host = (target or "").strip()
    is_ip = bool(host) and all(c.isdigit() or c == "." or c == ":" for c in host)
    asset: dict[str, Any] = {"kind": "host", "tags": tags or []}
    if is_ip:
        asset["ip"] = host
    else:
        asset["hostname"] = host
        asset["ip"] = ""
    if ports is not None:
        asset["ports"] = ports
    return {
        "schema": "finding.v1",
        "finding_type": finding_type,
        "severity": severity,
        "title": title,
        "description": description,
        "target": target,
        "asset": asset,
        "evidence": evidence or {},
        "tags": tags or [],
        "cve_ids": cve_ids or [],
        "bdu_ids": [],
        "module_id": module_id,
        "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _default_instance_id(module_id: str) -> str:
    host = socket.gethostname() or "unknown"
    return f"{module_id}-{host}-{uuid.uuid4().hex[:8]}"


def parse_allowlist(raw: Optional[str], defaults: Optional[list[str]] = None) -> set[str]:
    items = [x.strip().lower() for x in (raw or "").split(",") if x.strip()]
    if not items:
        items = list(defaults or [])
    return {x.lower() for x in items}


def merge_allowlist(
    env_raw: Optional[str],
    core_raw: Optional[str],
    defaults: Optional[list[str]] = None,
) -> set[str]:
    """Prefer Core allowlist when set; else env; else defaults."""
    if (core_raw or "").strip():
        return parse_allowlist(core_raw, defaults)
    return parse_allowlist(env_raw, defaults)


def target_allowed(target: str, allowlist: set[str]) -> bool:
    """Allow exact host/IP/URL-host match or IP inside an allowlisted CIDR."""
    import ipaddress
    from urllib.parse import urlparse

    t = (target or "").strip().lower()
    if not t:
        return False
    if t in allowlist:
        return True
    # URL form
    if "://" in t:
        host = (urlparse(t).hostname or "").lower()
    else:
        host = t
        if host.startswith("[") and "]" in host:
            host = host[1 : host.index("]")]
        # strip optional :port for hostname/ipv4
        if host.count(":") == 1 and not host.startswith("["):
            left, right = host.rsplit(":", 1)
            if right.isdigit():
                host = left
    if not host:
        return False
    if host in allowlist:
        return True
    # allowlist may contain bare URLs
    for entry in allowlist:
        if "://" in entry:
            eh = (urlparse(entry).hostname or "").lower()
            if eh and eh == host:
                return True
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    for entry in allowlist:
        try:
            if "/" in entry:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            elif addr == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def normalize_http_target(target: str) -> str:
    t = (target or "").strip()
    if not t:
        return ""
    if "://" not in t:
        return f"http://{t}"
    return t
