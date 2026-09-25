"""
VBXSystem OWASP ZAP worker.

Scan types: baseline | spider | full | api.
Uses zap-*-scan scripts when available; optional ZAP daemon API for spider + active scan.
Maps all alert risk levels to findings. Allowlist enforced.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

import httpx  # noqa: E402
from vbx_module_sdk import (  # noqa: E402
    ModuleJob,
    VbxModuleClient,
    finding_v1,
    merge_allowlist,
    normalize_http_target,
    parse_allowlist,
    target_allowed,
)

logging.basicConfig(
    level=os.environ.get("VBX_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vbx.zap")

MODULE_ID = "zap"
DEFAULT_ALLOWLIST = (
    "127.0.0.1",
    "scan-target",
    "http://scan-target",
    "https://scan-target",
    "host.docker.internal",
    "http://host.docker.internal",
)
POLL_INTERVAL = float(os.environ.get("VBX_SCAN_POLL_INTERVAL", "5"))
ZAP_TIMEOUT = int(os.environ.get("VBX_ZAP_TIMEOUT", "300"))
REPORT_PATH = Path(os.environ.get("VBX_ZAP_REPORT", "/zap/wrk/vbx-zap-report.json"))
ZAP_API_URL = (os.environ.get("VBX_ZAP_API_URL") or "http://127.0.0.1:8080").rstrip("/")
ZAP_API_KEY = os.environ.get("VBX_ZAP_API_KEY") or ""

SCAN_TYPES = ("baseline", "spider", "full", "api")
RUNTIME: dict[str, Any] = {
    "zap_timeout_sec": ZAP_TIMEOUT,
    "zap_default_scan_type": "baseline",
    "zap_default_ajax_spider": False,
    "zap_default_context_name": "",
    "zap_default_context_user": "",
    "zap_default_credential_id": None,
}

# ZAP riskcode: 0 Informational, 1 Low, 2 Medium, 3 High
RISK_TO_SEVERITY = {
    "0": "info",
    "1": "low",
    "2": "medium",
    "3": "high",
    "informational": "info",
    "info": "info",
    "low": "low",
    "medium": "medium",
    "high": "high",
}


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _find_script(*names: str) -> Optional[str]:
    for name in names:
        path = shutil.which(name)
        if path:
            return path
        for candidate in (f"/zap/{name}", f"/usr/local/bin/{name}"):
            if Path(candidate).is_file():
                return candidate
    return None


def resolve_scan_options(params: dict[str, Any], defaults: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    d = {**RUNTIME, **(defaults or {})}
    scan_type = str(params.get("scan_type") or d.get("zap_default_scan_type") or "baseline").strip().lower()
    if scan_type not in SCAN_TYPES:
        scan_type = "baseline"
    max_duration = params.get("max_duration") or params.get("timeout") or d.get("zap_timeout_sec") or ZAP_TIMEOUT
    try:
        max_duration_i = max(30, min(int(max_duration), 7200))
    except (TypeError, ValueError):
        max_duration_i = int(d.get("zap_timeout_sec") or ZAP_TIMEOUT)
    auth = params.get("auth") if isinstance(params.get("auth"), dict) else {}
    extra_from_auth = auth.get("extra") if isinstance(auth.get("extra"), dict) else {}
    context_name = str(
        params.get("context_name")
        or auth.get("context_name")
        or d.get("zap_default_context_name")
        or ""
    ).strip()
    context_user = str(
        params.get("context_user")
        or auth.get("user")
        or auth.get("context_user")
        or d.get("zap_default_context_user")
        or ""
    ).strip()
    credential_id = (
        params.get("credential_id")
        or auth.get("credential_id")
        or d.get("zap_default_credential_id")
    )
    try:
        credential_id_i = int(credential_id) if credential_id not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        credential_id_i = None
    login_url = str(
        params.get("login_url")
        or auth.get("login_url")
        or extra_from_auth.get("login_url")
        or ""
    ).strip()
    username_field = str(
        params.get("username_field")
        or auth.get("username_field")
        or extra_from_auth.get("username_field")
        or "username"
    ).strip() or "username"
    password_field = str(
        params.get("password_field")
        or auth.get("password_field")
        or extra_from_auth.get("password_field")
        or "password"
    ).strip() or "password"
    return {
        "scan_type": scan_type,
        "ajax_spider": _as_bool(params.get("ajax_spider"), bool(d.get("zap_default_ajax_spider"))),
        "max_duration": max_duration_i,
        "context_name": context_name,
        "context_user": context_user,
        "credential_id": credential_id_i,
        "login_url": login_url,
        "username_field": username_field,
        "password_field": password_field,
        "openapi": str(params.get("openapi") or params.get("api_spec") or "").strip(),
    }


def _prepare_wrk() -> tuple[Path, Path, str]:
    wrk = Path("/zap/wrk")
    try:
        wrk.mkdir(parents=True, exist_ok=True)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"cannot create /zap/wrk: {exc}") from exc
    report = REPORT_PATH
    if not str(report).startswith(str(wrk)):
        report = wrk / report.name
    if report.exists():
        try:
            report.unlink()
        except OSError:
            pass
    return wrk, report, report.name


def _run_zap_script(script: str, url: str, extra_args: Optional[list[str]] = None, timeout: int = 300) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    wrk, report, report_name = _prepare_wrk()
    cmd = [script, "-t", url, "-J", report_name, "-I", "-d"]
    if extra_args:
        cmd.extend(extra_args)
    logger.info("running (cwd=%s): %s", wrk, " ".join(cmd))
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        cwd=str(wrk),
        env={**os.environ, "HOME": os.environ.get("HOME") or "/home/zap"},
    )
    raw: dict[str, Any] = {
        "tool": Path(script).name,
        "command": cmd,
        "returncode": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-4000:],
        "stderr_tail": (proc.stderr or "")[-2000:],
    }
    alerts = _load_report_alerts(report, report_name, wrk, raw)
    if proc.returncode not in (0, 1, 2) and not alerts:
        raise RuntimeError(
            f"{Path(script).name} failed rc={proc.returncode}: {(proc.stderr or proc.stdout or '')[:500]}"
        )
    return alerts, raw


def _load_report_alerts(report: Path, report_name: str, wrk: Path, raw: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    for path in (report, wrk / report_name):
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
            raw["report_keys"] = list(data.keys()) if isinstance(data, dict) else type(data).__name__
            alerts = _extract_alerts(data)
            if path != report:
                raw["report_alt"] = str(path)
            break
        except Exception as exc:  # noqa: BLE001
            raw["parse_error"] = str(exc)
    if not alerts:
        raw["report_missing"] = True
    return alerts


def _zap_mock_enabled() -> bool:
    return str(os.environ.get("VBX_ZAP_MOCK", "")).strip().lower() in {"1", "true", "yes", "on"}


def _mock_alerts(url: str, error: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Explicit mock fixture only when VBX_ZAP_MOCK is on — never a silent substitute."""
    alerts = [
        {
            "name": "Mock Missing Security Header",
            "riskcode": "1",
            "riskdesc": "Low",
            "desc": "Simulated ZAP finding for local tests",
            "url": url,
            "param": "",
            "pluginid": "10038",
        },
        {
            "name": "Mock Informational Banner",
            "riskcode": "0",
            "riskdesc": "Informational",
            "desc": "Simulated info-level alert",
            "url": url,
            "pluginid": "10009",
        },
    ]
    return alerts, {
        "tool": "zap_mock",
        "mock": True,
        "error": error,
        "alerts": alerts,
        "note": "VBX_ZAP_MOCK enabled — not a real ZAP scan",
    }


class ZapUnavailableError(RuntimeError):
    """Raised when the requested ZAP path cannot run (daemon/script missing)."""


def _require_or_mock(url: str, error: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if _zap_mock_enabled():
        return _mock_alerts(url, error)
    raise ZapUnavailableError(error)


def _extract_alerts(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [a for a in data if isinstance(a, dict)]
    if not isinstance(data, dict):
        return []
    sites = data.get("site")
    if isinstance(sites, list):
        out: list[dict[str, Any]] = []
        for site in sites:
            if not isinstance(site, dict):
                continue
            for alert in site.get("alerts") or []:
                if isinstance(alert, dict):
                    out.append(alert)
        return out
    if isinstance(data.get("alerts"), list):
        return [a for a in data["alerts"] if isinstance(a, dict)]
    return []


def _zap_api(path: str, params: Optional[dict[str, Any]] = None) -> Any:
    q = dict(params or {})
    if ZAP_API_KEY:
        q["apikey"] = ZAP_API_KEY
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(f"{ZAP_API_URL}{path}", params=q)
    if resp.status_code != 200:
        raise RuntimeError(f"ZAP API {path} -> {resp.status_code}: {(resp.text or '')[:300]}")
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _zap_api_available() -> bool:
    try:
        _zap_api("/JSON/core/view/version/")
        return True
    except Exception:  # noqa: BLE001
        return False


def _url_encode_form_pair(key: str, value: str) -> str:
    from urllib.parse import quote

    return f"{quote(key, safe='')}={quote(value, safe='')}"


def configure_form_auth(
    target_url: str,
    opts: dict[str, Any],
    *,
    username: str,
    password: str,
) -> dict[str, Any]:
    """Create ZAP context + form-based authentication + forced user.

    Requires a reachable ZAP daemon (VBX_ZAP_API_URL). Returns auth meta for raw results.
    """
    from urllib.parse import urlencode, urlparse

    login_url = str(opts.get("login_url") or "").strip() or target_url
    username_field = str(opts.get("username_field") or "username").strip() or "username"
    password_field = str(opts.get("password_field") or "password").strip() or "password"
    context_name = str(opts.get("context_name") or "").strip() or "vbx-form-auth"
    user_name = str(opts.get("context_user") or username or "vbx-user").strip() or "vbx-user"

    parsed = urlparse(target_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    include_regex = f"{origin}.*"

    meta: dict[str, Any] = {
        "mode": "form_based",
        "context_name": context_name,
        "login_url": login_url,
        "username_field": username_field,
        "password_field": password_field,
        "include_regex": include_regex,
    }

    created = _zap_api("/JSON/context/action/newContext/", {"contextName": context_name})
    context_id = str((created or {}).get("contextId") if isinstance(created, dict) else created)
    meta["context_id"] = context_id

    _zap_api(
        "/JSON/context/action/includeInContext/",
        {"contextName": context_name, "regex": include_regex},
    )

    login_request_data = "&".join(
        [
            _url_encode_form_pair(username_field, "{%username%}"),
            _url_encode_form_pair(password_field, "{%password%}"),
        ]
    )
    auth_config = urlencode({"loginUrl": login_url, "loginRequestData": login_request_data})
    _zap_api(
        "/JSON/authentication/action/setAuthenticationMethod/",
        {
            "contextId": context_id,
            "authMethodName": "formBasedAuthentication",
            "authMethodConfigParams": auth_config,
        },
    )

    user_resp = _zap_api(
        "/JSON/users/action/newUser/",
        {"contextId": context_id, "name": user_name},
    )
    user_id = str((user_resp or {}).get("userId") if isinstance(user_resp, dict) else user_resp)
    meta["user_id"] = user_id
    meta["user_name"] = user_name

    creds_params = urlencode({"username": username, "password": password})
    _zap_api(
        "/JSON/users/action/setAuthenticationCredentials/",
        {
            "contextId": context_id,
            "userId": user_id,
            "authCredentialsConfigParams": creds_params,
        },
    )
    _zap_api(
        "/JSON/users/action/setUserEnabled/",
        {"contextId": context_id, "userId": user_id, "enabled": "true"},
    )
    _zap_api("/JSON/forcedUser/action/setForcedUser/", {"contextId": context_id, "userId": user_id})
    _zap_api("/JSON/forcedUser/action/setForcedUserModeEnabled/", {"boolean": "true"})
    # Authenticate once so session cookies exist before spider/ascan
    try:
        _zap_api(
            "/JSON/users/action/authenticateAsUser/",
            {"contextId": context_id, "userId": user_id},
        )
        meta["authenticated"] = True
    except Exception as exc:  # noqa: BLE001
        meta["authenticate_warning"] = str(exc)
        meta["authenticated"] = False

    opts["context_name"] = context_name
    opts["context_user"] = user_name
    opts["_zap_context_id"] = context_id
    opts["_zap_user_id"] = user_id
    return meta


def apply_auth_hints_to_env(opts: dict[str, Any], *, username: str = "") -> dict[str, str]:
    """Env hints for baseline scripts — form auth is not fully supported without daemon API."""
    hints = {
        "VBX_ZAP_CONTEXT_NAME": str(opts.get("context_name") or ""),
        "VBX_ZAP_CONTEXT_USER": str(opts.get("context_user") or username or ""),
        "VBX_ZAP_LOGIN_URL": str(opts.get("login_url") or ""),
        "VBX_ZAP_USERNAME_FIELD": str(opts.get("username_field") or ""),
        "VBX_ZAP_PASSWORD_FIELD": str(opts.get("password_field") or ""),
        "VBX_ZAP_AUTH_LIMITATION": (
            "baseline/script mode cannot create form-based auth; "
            "configure VBX_ZAP_API_URL and use spider/full/api for vault credentials"
        ),
    }
    for key, value in hints.items():
        if value:
            os.environ[key] = value
    return hints


def _wait_until(check, timeout: int, label: str, poll: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(poll)
    raise TimeoutError(f"ZAP {label} timed out after {timeout}s")


def run_zap_api_scan(
    url: str,
    opts: dict[str, Any],
    *,
    active: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Spider (+ optional ajax) then optional active scan via ZAP daemon JSON API; pull alerts.

    Requires a reachable daemon at VBX_ZAP_API_URL. Raises ZapUnavailableError if unreachable
    (unless VBX_ZAP_MOCK is enabled).
    """
    raw: dict[str, Any] = {
        "tool": "zap-api",
        "url": url,
        "api_url": ZAP_API_URL,
        "active_scan": bool(active),
        "options": {k: v for k, v in opts.items() if not str(k).startswith("_")},
    }
    timeout = int(opts["max_duration"])
    try:
        _zap_api("/JSON/core/action/accessUrl/", {"url": url, "followRedirects": "true"})
    except Exception as exc:  # noqa: BLE001
        return _require_or_mock(
            url,
            error=(
                f"ZAP daemon unreachable at {ZAP_API_URL}: {exc}. "
                "Set VBX_ZAP_API_URL to a running ZAP instance, or enable VBX_ZAP_MOCK for fixtures."
            ),
        )

    spider_params: dict[str, Any] = {"url": url, "maxChildren": "10", "recurse": "true"}
    if opts.get("_zap_context_id") is not None and opts.get("_zap_user_id") is not None:
        spider = _zap_api(
            "/JSON/spider/action/scanAsUser/",
            {
                **spider_params,
                "contextId": str(opts["_zap_context_id"]),
                "userId": str(opts["_zap_user_id"]),
            },
        )
    else:
        spider = _zap_api("/JSON/spider/action/scan/", spider_params)
    spider_id = str((spider or {}).get("scan") if isinstance(spider, dict) else spider)
    raw["spider_id"] = spider_id

    def _spider_done() -> bool:
        st = _zap_api("/JSON/spider/view/status/", {"scanId": spider_id})
        status = str((st or {}).get("status") if isinstance(st, dict) else st)
        return status.isdigit() and int(status) >= 100

    _wait_until(_spider_done, min(timeout, 600), "spider")

    if opts.get("ajax_spider"):
        _zap_api("/JSON/ajaxSpider/action/scan/", {"url": url})

        def _ajax_done() -> bool:
            st = _zap_api("/JSON/ajaxSpider/view/status/")
            status = str((st or {}).get("status") if isinstance(st, dict) else st).lower()
            return status in {"stopped", "complete", "completed"}

        try:
            _wait_until(_ajax_done, min(timeout // 2, 300), "ajaxSpider")
        except TimeoutError as exc:
            raw["ajax_warning"] = str(exc)

    if active:
        ascan_params: dict[str, Any] = {"url": url, "recurse": "true", "inScopeOnly": "false"}
        if opts.get("_zap_context_id") is not None:
            ascan_params["contextId"] = str(opts["_zap_context_id"])
        if opts.get("_zap_user_id") is not None:
            ascan = _zap_api(
                "/JSON/ascan/action/scanAsUser/",
                {
                    **ascan_params,
                    "contextId": str(opts["_zap_context_id"]),
                    "userId": str(opts["_zap_user_id"]),
                },
            )
        else:
            ascan = _zap_api("/JSON/ascan/action/scan/", ascan_params)
        ascan_id = str((ascan or {}).get("scan") if isinstance(ascan, dict) else ascan)
        raw["ascan_id"] = ascan_id

        def _ascan_done() -> bool:
            st = _zap_api("/JSON/ascan/view/status/", {"scanId": ascan_id})
            status = str((st or {}).get("status") if isinstance(st, dict) else st)
            return status.isdigit() and int(status) >= 100

        remaining = max(30, timeout - 30)
        _wait_until(_ascan_done, remaining, "ascan")

    # Import OpenAPI into ZAP site tree when provided (api mode helper)
    openapi = str(opts.get("openapi") or "").strip()
    if openapi:
        try:
            _zap_api("/JSON/openapi/action/importUrl/", {"url": openapi, "hostOverride": url})
            raw["openapi_imported"] = openapi
        except Exception as exc:  # noqa: BLE001
            raw["openapi_import_warning"] = str(exc)

    alerts_payload = _zap_api("/JSON/alert/view/alerts/", {"baseurl": url, "start": "0", "count": "5000"})
    alerts_list = alerts_payload.get("alerts") if isinstance(alerts_payload, dict) else alerts_payload
    alerts = [a for a in (alerts_list or []) if isinstance(a, dict)]
    raw["alert_count"] = len(alerts)
    return alerts, raw


def run_zap_scan(url: str, opts: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Dispatch by scan_type. Never silently substitute baseline for spider/full/api."""
    scan_type = opts["scan_type"]
    timeout = int(opts["max_duration"])
    openapi = opts.get("openapi") or ""

    if scan_type == "baseline":
        script = _find_script("zap-baseline.py")
        if not script:
            return _require_or_mock(
                url,
                error=(
                    "zap-baseline.py not found. Install OWASP ZAP stable tools "
                    "or set VBX_ZAP_MOCK=true for fixtures."
                ),
            )
        return _run_zap_script(script, url, timeout=timeout)

    if scan_type == "api":
        script = _find_script("zap-api-scan.py")
        if script:
            target_spec = openapi or url
            alerts, raw = _run_zap_script(
                script, target_spec, extra_args=["-f", "openapi"], timeout=timeout
            )
            raw["openapi"] = openapi or url
            raw["path"] = "zap-api-scan.py"
            return alerts, raw
        if not _zap_api_available():
            return _require_or_mock(
                url,
                error=(
                    "api scan requires zap-api-scan.py or a reachable ZAP daemon "
                    f"(VBX_ZAP_API_URL={ZAP_API_URL}). Neither is available."
                ),
            )
        # Daemon path: import OpenAPI (if any) + spider + active
        api_opts = {**opts, "openapi": openapi or url}
        alerts, raw = run_zap_api_scan(url, api_opts, active=True)
        raw["path"] = "zap-daemon-api"
        raw["note"] = "zap-api-scan.py missing; used ZAP daemon OpenAPI import + spider + active scan"
        return alerts, raw

    if scan_type == "full":
        script = _find_script("zap-full-scan.py")
        if script:
            extra = ["-j"] if opts.get("ajax_spider") else None
            alerts, raw = _run_zap_script(script, url, extra_args=extra, timeout=timeout)
            raw["path"] = "zap-full-scan.py"
            return alerts, raw
        if not _zap_api_available():
            return _require_or_mock(
                url,
                error=(
                    "full scan requires zap-full-scan.py or a reachable ZAP daemon "
                    f"(VBX_ZAP_API_URL={ZAP_API_URL}). Neither is available — "
                    "refusing to silently run baseline instead."
                ),
            )
        alerts, raw = run_zap_api_scan(url, opts, active=True)
        raw["path"] = "zap-daemon-api"
        raw["note"] = "zap-full-scan.py missing; used ZAP daemon spider + active scan"
        return alerts, raw

    if scan_type == "spider":
        # Spider + active via daemon only — never pretend baseline was a spider.
        if not _zap_api_available():
            return _require_or_mock(
                url,
                error=(
                    f"spider scan requires a reachable ZAP daemon at VBX_ZAP_API_URL={ZAP_API_URL}. "
                    "Daemon not available — refusing to silently fall back to zap-baseline.py. "
                    "Start ZAP with -daemon (see modules/zap/entrypoint.sh) or set VBX_ZAP_MOCK=true."
                ),
            )
        alerts, raw = run_zap_api_scan(url, opts, active=True)
        raw["path"] = "zap-daemon-api"
        raw["scan_type"] = "spider"
        return alerts, raw

    return _require_or_mock(url, error=f"unknown scan_type {scan_type!r}")


def risk_to_severity(alert: dict[str, Any]) -> str:
    risk = str(alert.get("riskcode") or alert.get("risk") or alert.get("riskdesc") or "0").lower().strip()
    # Numeric codes first
    if risk in RISK_TO_SEVERITY:
        return RISK_TO_SEVERITY[risk]
    # riskdesc may be "High (3)" / "Informational (0)"
    for key, sev in (
        ("informational", "info"),
        ("info", "info"),
        ("high", "high"),
        ("medium", "medium"),
        ("low", "low"),
        ("3", "high"),
        ("2", "medium"),
        ("1", "low"),
        ("0", "info"),
    ):
        if key in risk:
            return sev
    return "info"


def alerts_to_findings(url: str, alerts: list[dict[str, Any]], *, scan_type: str = "baseline") -> list[dict[str, Any]]:
    host = urlparse(url).hostname or url
    findings: list[dict[str, Any]] = []
    for alert in alerts:
        name = str(alert.get("name") or alert.get("alert") or "ZAP alert")
        severity = risk_to_severity(alert)
        findings.append(
            finding_v1(
                finding_type="zap_alert",
                title=name[:200],
                target=host,
                severity=severity,
                description=str(alert.get("desc") or alert.get("description") or "")[:2000],
                evidence=_zap_evidence(alert, url=url, scan_type=scan_type),
                tags=["zap", scan_type, severity],
                module_id=MODULE_ID,
            )
        )
    return findings


def _zap_evidence(alert: dict[str, Any], *, url: str, scan_type: str) -> dict[str, Any]:
    ev: dict[str, Any] = {
        "url": alert.get("url") or url,
        "param": alert.get("param"),
        "pluginid": alert.get("pluginid") or alert.get("pluginId"),
        "risk": alert.get("riskdesc") or alert.get("risk") or alert.get("riskcode"),
        "riskcode": alert.get("riskcode"),
        "cweid": alert.get("cweid") or alert.get("cweId"),
        "wascid": alert.get("wascid") or alert.get("wascId"),
        "confidence": alert.get("confidence"),
        "scan_type": scan_type,
    }
    solution = str(alert.get("solution") or "").strip()
    if solution:
        ev["solution"] = solution[:2000]
    return ev


def handle_job(
    client: VbxModuleClient,
    job: ModuleJob,
    allowlist: set[str],
    *,
    defaults: Optional[dict[str, Any]] = None,
) -> None:
    logger.info("claimed job %s target=%s", job.id, job.target)
    client.job_heartbeat(job.id, progress=0.05, message="validating target")

    url = normalize_http_target(job.target)
    if not target_allowed(job.target, allowlist) and not target_allowed(url, allowlist):
        msg = f"target {job.target!r} is not in VBX_SCAN_ALLOWLIST"
        logger.warning(msg)
        client.post_results(job.id, status="failed", findings=[], error=msg)
        return

    opts = resolve_scan_options(job.params, defaults)
    auth_meta: dict[str, Any] = {}
    username = ""
    password = ""

    if opts.get("credential_id"):
        client.job_heartbeat(job.id, progress=0.1, message="loading credential")
        try:
            cred = client.fetch_credential(opts["credential_id"])
        except Exception as exc:  # noqa: BLE001
            client.post_results(
                job.id,
                status="failed",
                findings=[],
                error=f"credential fetch failed: {exc}",
            )
            return
        username = str(cred.get("username") or "")
        password = str(cred.get("password") or "")
        extra = cred.get("extra") if isinstance(cred.get("extra"), dict) else {}
        kind = str(cred.get("kind") or "http_form").strip().lower()
        if not opts.get("login_url") and extra.get("login_url"):
            opts["login_url"] = str(extra["login_url"]).strip()
        if extra.get("username_field"):
            opts["username_field"] = str(extra["username_field"]).strip() or opts["username_field"]
        if extra.get("password_field"):
            opts["password_field"] = str(extra["password_field"]).strip() or opts["password_field"]
        if kind == "zap_context":
            if extra.get("context_name") and not opts.get("context_name"):
                opts["context_name"] = str(extra["context_name"]).strip()
            if extra.get("context_user") and not opts.get("context_user"):
                opts["context_user"] = str(extra["context_user"]).strip()
        auth_meta["credential_id"] = opts["credential_id"]
        auth_meta["credential_kind"] = kind
        auth_meta["credential_name"] = str(cred.get("name") or "")

        if kind in {"http_form", "http_basic"} and (username or password):
            if _zap_api_available():
                try:
                    auth_meta.update(
                        configure_form_auth(url, opts, username=username, password=password)
                    )
                    # Prefer API path when we just configured auth
                    if opts["scan_type"] == "baseline":
                        opts["scan_type"] = "spider"
                        auth_meta["scan_type_upgraded"] = "spider"
                        auth_meta["note"] = (
                            "baseline scripts cannot inject form auth; upgraded to spider via ZAP API"
                        )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("form auth setup failed: %s", exc)
                    auth_meta["form_auth_error"] = str(exc)
                    auth_meta["hints"] = apply_auth_hints_to_env(opts, username=username)
            else:
                auth_meta["hints"] = apply_auth_hints_to_env(opts, username=username)
                auth_meta["limitation"] = (
                    "ZAP API not reachable; form-based auth requires VBX_ZAP_API_URL. "
                    "Baseline/script mode will run unauthenticated."
                )
                logger.warning(auth_meta["limitation"])

    if opts["context_name"]:
        logger.info("job %s context=%s user=%s", job.id, opts["context_name"], opts["context_user"] or "-")

    client.job_heartbeat(job.id, progress=0.2, message=f"{opts['scan_type']} {url}")
    try:
        alerts, raw = run_zap_scan(url, opts)
        raw["context_name"] = opts["context_name"] or None
        raw["context_user"] = opts["context_user"] or None
        raw["credential_id"] = opts.get("credential_id")
        if auth_meta:
            # Never echo password
            raw["auth"] = {k: v for k, v in auth_meta.items() if k != "password"}
        findings = alerts_to_findings(url, alerts, scan_type=opts["scan_type"])
        client.job_heartbeat(job.id, progress=0.9, message=f"{len(findings)} alert(s)")
        client.post_results(job.id, status="success", findings=findings, raw=raw)
        logger.info("job %s completed: %d finding(s)", job.id, len(findings))
    except subprocess.TimeoutExpired:
        client.post_results(
            job.id,
            status="failed",
            findings=[],
            error=f"ZAP timeout after {opts['max_duration']}s",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.id)
        client.post_results(job.id, status="failed", findings=[], error=str(exc))


def _apply_runtime(cfg: dict[str, Any]) -> dict[str, Any]:
    global ZAP_TIMEOUT
    for key in RUNTIME:
        if key in cfg and cfg[key] is not None:
            RUNTIME[key] = cfg[key]
    if cfg.get("zap_timeout_sec"):
        ZAP_TIMEOUT = int(cfg["zap_timeout_sec"])
        RUNTIME["zap_timeout_sec"] = ZAP_TIMEOUT
    if "zap_default_credential_id" in cfg:
        cid = cfg.get("zap_default_credential_id")
        try:
            RUNTIME["zap_default_credential_id"] = int(cid) if cid not in (None, "", 0, "0") else None
        except (TypeError, ValueError):
            RUNTIME["zap_default_credential_id"] = None
    return dict(RUNTIME)


def main() -> None:
    allowlist = parse_allowlist(os.environ.get("VBX_SCAN_ALLOWLIST"), list(DEFAULT_ALLOWLIST))
    defaults = dict(RUNTIME)
    logger.info(
        "zap worker starting; allowlist=%s baseline=%s full=%s",
        sorted(allowlist),
        _find_script("zap-baseline.py"),
        _find_script("zap-full-scan.py"),
    )

    client = VbxModuleClient(
        module_id=MODULE_ID,
        capabilities=["web.baseline", "web.spider", "web.active", "web.api", "finding.v1"],
        version="0.3.0",
    )
    try:
        client.register(meta={"scan_types": list(SCAN_TYPES)})
        cfg = client.fetch_runtime_config()
        allowlist = merge_allowlist(
            os.environ.get("VBX_SCAN_ALLOWLIST"),
            str(cfg.get("allowlist") or ""),
            list(DEFAULT_ALLOWLIST),
        )
        defaults = _apply_runtime(cfg)
    except Exception as exc:  # noqa: BLE001
        logger.warning("register failed: %s", exc)

    client.start_heartbeat_loop(interval_sec=float(os.environ.get("VBX_MODULE_HB_INTERVAL", "15")))
    poll_n = 0
    try:
        while True:
            if poll_n % 12 == 0:
                try:
                    cfg = client.fetch_runtime_config()
                    allowlist = merge_allowlist(
                        os.environ.get("VBX_SCAN_ALLOWLIST"),
                        str(cfg.get("allowlist") or ""),
                        list(DEFAULT_ALLOWLIST),
                    )
                    defaults = _apply_runtime(cfg)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("runtime refresh failed: %s", exc)
            poll_n += 1
            try:
                job = client.claim_job()
            except Exception as exc:  # noqa: BLE001
                logger.warning("claim failed: %s", exc)
                time.sleep(POLL_INTERVAL)
                continue
            if job is None:
                time.sleep(POLL_INTERVAL)
                continue
            handle_job(client, job, allowlist, defaults=defaults)
    except KeyboardInterrupt:
        logger.info("shutting down")
    finally:
        client.stop_heartbeat_loop()


if __name__ == "__main__":
    main()
