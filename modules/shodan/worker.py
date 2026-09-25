"""
VBXSystem Shodan enrichment worker.

Modes: host lookup, DNS resolve, search (query string).
Admin: API key, mock, rate-limit hint, enabled modes.
"""

from __future__ import annotations

import logging
import os
import socket
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
    parse_allowlist,
    target_allowed,
)

logging.basicConfig(
    level=os.environ.get("VBX_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vbx.shodan")

MODULE_ID = "shodan"
DEFAULT_ALLOWLIST = ("127.0.0.1", "scan-target", "host.docker.internal", "8.8.8.8")
POLL_INTERVAL = float(os.environ.get("VBX_SCAN_POLL_INTERVAL", "5"))
SHODAN_TIMEOUT = float(os.environ.get("VBX_SHODAN_TIMEOUT", "30"))
MODES = ("host", "search", "dns")

MOCK_HOST: dict[str, Any] = {
    "ip_str": "8.8.8.8",
    "hostnames": ["dns.google"],
    "domains": ["google"],
    "org": "Google LLC",
    "isp": "Google",
    "asn": "AS15169",
    "os": None,
    "ports": [53, 443],
    "vulns": ["CVE-2023-0001"],
    "tags": ["cdn"],
    "data": [
        {
            "port": 53,
            "transport": "udp",
            "product": "Google Public DNS",
            "vulns": {},
        },
        {
            "port": 443,
            "transport": "tcp",
            "product": "Google frontend",
            "vulns": {"CVE-2023-0001": {"verified": False, "cvss": 5.0}},
        },
    ],
}

MOCK_SEARCH: dict[str, Any] = {
    "total": 1,
    "matches": [
        {
            "ip_str": "8.8.8.8",
            "port": 443,
            "org": "Google LLC",
            "hostnames": ["dns.google"],
            "product": "Google frontend",
            "transport": "tcp",
        }
    ],
}

_last_api_call = 0.0


def _mock_enabled() -> bool:
    return str(os.environ.get("VBX_SHODAN_MOCK", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _rate_wait(hint_rps: float = 1.0) -> None:
    """Simple client-side pacing using admin rate_limit_hint (requests/sec)."""
    global _last_api_call
    rps = max(0.1, float(hint_rps or 1.0))
    min_gap = 1.0 / rps
    now = time.monotonic()
    wait = min_gap - (now - _last_api_call)
    if wait > 0:
        time.sleep(wait)
    _last_api_call = time.monotonic()


def resolve_ip(target: str) -> str:
    t = (target or "").strip()
    if not t:
        raise ValueError("empty target")
    if "://" in t:
        t = urlparse(t).hostname or t
    if t.startswith("[") and "]" in t:
        t = t[1 : t.index("]")]
    if t.count(":") == 1:
        left, right = t.rsplit(":", 1)
        if right.isdigit():
            t = left
    try:
        socket.inet_pton(socket.AF_INET, t)
        return t
    except OSError:
        pass
    try:
        socket.inet_pton(socket.AF_INET6, t)
        return t
    except OSError:
        pass
    infos = socket.getaddrinfo(t, None, socket.AF_INET)
    if not infos:
        raise ValueError(f"cannot resolve {target!r}")
    return infos[0][4][0]


def fetch_shodan_host(ip: str, api_key: str, *, rate_hint: float = 1.0) -> dict[str, Any]:
    _rate_wait(rate_hint)
    url = f"https://api.shodan.io/shodan/host/{ip}"
    with httpx.Client(timeout=SHODAN_TIMEOUT) as client:
        resp = client.get(url, params={"key": api_key})
    if resp.status_code == 404:
        return {"ip_str": ip, "ports": [], "data": [], "vulns": [], "error": "not_found"}
    if resp.status_code != 200:
        raise RuntimeError(f"Shodan API {resp.status_code}: {(resp.text or '')[:300]}")
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("unexpected Shodan response")
    return data


def fetch_shodan_search(query: str, api_key: str, *, rate_hint: float = 1.0) -> dict[str, Any]:
    _rate_wait(rate_hint)
    url = "https://api.shodan.io/shodan/host/search"
    with httpx.Client(timeout=SHODAN_TIMEOUT) as client:
        resp = client.get(url, params={"key": api_key, "query": query})
    if resp.status_code != 200:
        raise RuntimeError(f"Shodan search {resp.status_code}: {(resp.text or '')[:300]}")
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("unexpected Shodan search response")
    return data


def fetch_shodan_dns_resolve(hostnames: list[str], api_key: str, *, rate_hint: float = 1.0) -> dict[str, Any]:
    _rate_wait(rate_hint)
    url = "https://api.shodan.io/dns/resolve"
    with httpx.Client(timeout=SHODAN_TIMEOUT) as client:
        resp = client.get(url, params={"key": api_key, "hostnames": ",".join(hostnames)})
    if resp.status_code != 200:
        raise RuntimeError(f"Shodan DNS {resp.status_code}: {(resp.text or '')[:300]}")
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("unexpected Shodan DNS response")
    return data


def host_to_findings(target: str, ip: str, host: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    hostnames = host.get("hostnames") if isinstance(host.get("hostnames"), list) else []
    domains = host.get("domains") if isinstance(host.get("domains"), list) else []
    hostname = str(hostnames[0]) if hostnames else target
    ports = host.get("ports") if isinstance(host.get("ports"), list) else []
    org = str(host.get("org") or "")
    isp = str(host.get("isp") or "")
    asn = str(host.get("asn") or "")
    tags = host.get("tags") if isinstance(host.get("tags"), list) else []
    vulns_top = host.get("vulns") if isinstance(host.get("vulns"), list) else []
    cve_ids = [str(v).upper() for v in vulns_top if str(v).strip()]

    asset_ports = [{"port": int(p), "state": "open"} for p in ports if str(p).isdigit() or isinstance(p, int)]

    if ports or org or hostnames:
        findings.append(
            finding_v1(
                finding_type="shodan_host",
                title=f"Shodan host {ip}" + (f" ({org})" if org else ""),
                target=ip,
                severity="info",
                description=(
                    f"Hostnames: {', '.join(map(str, hostnames)) or '—'}; "
                    f"domains: {', '.join(map(str, domains)) or '—'}; "
                    f"ISP={isp or '—'} ASN={asn or '—'}"
                ),
                evidence={
                    "ip": ip,
                    "org": org,
                    "isp": isp,
                    "asn": asn,
                    "os": host.get("os"),
                    "ports": ports,
                    "hostnames": hostnames,
                    "domains": domains,
                    "tags": tags,
                },
                tags=["shodan", "enrichment", "host"],
                module_id=MODULE_ID,
                cve_ids=cve_ids,
                ports=asset_ports,
            )
        )

    for svc in host.get("data") or []:
        if not isinstance(svc, dict):
            continue
        port = svc.get("port")
        product = str(svc.get("product") or svc.get("module") or "service")
        transport = str(svc.get("transport") or "tcp")
        svc_vulns = svc.get("vulns") if isinstance(svc.get("vulns"), dict) else {}
        svc_cves = [str(k).upper() for k in svc_vulns.keys()]
        severity = "medium" if svc_cves else "info"
        if any(
            (svc_vulns.get(c) or {}).get("cvss", 0)
            and float((svc_vulns.get(c) or {}).get("cvss") or 0) >= 7
            for c in svc_cves
        ):
            severity = "high"
        findings.append(
            finding_v1(
                finding_type="shodan_service",
                title=f"Shodan {port}/{transport} ({product})",
                target=ip,
                severity=severity,
                description=f"Observed on {hostname or ip}",
                evidence={
                    "port": port,
                    "transport": transport,
                    "product": product,
                    "hostnames": hostnames,
                    "vulns": svc_vulns,
                },
                tags=["shodan", "service", f"port:{port}"],
                module_id=MODULE_ID,
                cve_ids=svc_cves,
                ports=[{"port": port, "protocol": transport, "state": "open"}],
            )
        )

    if host.get("error") == "not_found":
        findings.append(
            finding_v1(
                finding_type="shodan_host",
                title=f"No Shodan data for {ip}",
                target=ip,
                severity="info",
                description="Host not found in Shodan index",
                evidence={"ip": ip, "status": "not_found"},
                tags=["shodan"],
                module_id=MODULE_ID,
            )
        )
    return findings


def search_to_findings(query: str, data: dict[str, Any], allowlist: set[str]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    matches = data.get("matches") if isinstance(data.get("matches"), list) else []
    total = data.get("total")
    findings.append(
        finding_v1(
            finding_type="shodan_search",
            title=f"Shodan search: {query[:120]}",
            target=query[:200],
            severity="info",
            description=f"total={total}, returned={len(matches)} (allowlist-filtered)",
            evidence={"query": query, "total": total, "returned": len(matches)},
            tags=["shodan", "search"],
            module_id=MODULE_ID,
        )
    )
    for m in matches:
        if not isinstance(m, dict):
            continue
        ip = str(m.get("ip_str") or m.get("ip") or "")
        if not ip:
            continue
        if not target_allowed(ip, allowlist):
            continue
        port = m.get("port")
        product = str(m.get("product") or m.get("module") or "")
        hostnames = m.get("hostnames") if isinstance(m.get("hostnames"), list) else []
        findings.append(
            finding_v1(
                finding_type="shodan_match",
                title=f"Shodan match {ip}" + (f":{port}" if port else "") + (f" ({product})" if product else ""),
                target=ip,
                severity="info",
                description=f"Query={query[:200]}; hostnames={', '.join(map(str, hostnames)) or '—'}",
                evidence={
                    "ip": ip,
                    "port": port,
                    "org": m.get("org"),
                    "product": product,
                    "hostnames": hostnames,
                    "transport": m.get("transport"),
                },
                tags=["shodan", "search", "match"],
                module_id=MODULE_ID,
                ports=[{"port": port, "protocol": m.get("transport") or "tcp", "state": "open"}]
                if port
                else None,
            )
        )
    return findings


def dns_to_findings(hostnames: list[str], mapping: dict[str, Any], allowlist: set[str]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for name in hostnames:
        ip = mapping.get(name)
        ip_s = str(ip) if ip else ""
        if ip_s and not target_allowed(ip_s, allowlist) and not target_allowed(name, allowlist):
            findings.append(
                finding_v1(
                    finding_type="shodan_dns",
                    title=f"DNS {name} → {ip_s} (blocked by allowlist)",
                    target=name,
                    severity="info",
                    description="Resolved IP is outside allowlist; enrichment skipped",
                    evidence={"hostname": name, "ip": ip_s, "allowlisted": False},
                    tags=["shodan", "dns"],
                    module_id=MODULE_ID,
                )
            )
            continue
        findings.append(
            finding_v1(
                finding_type="shodan_dns",
                title=f"DNS {name} → {ip_s or 'unresolved'}",
                target=name,
                severity="info",
                description="Shodan DNS resolve",
                evidence={"hostname": name, "ip": ip_s or None, "allowlisted": True},
                tags=["shodan", "dns"],
                module_id=MODULE_ID,
            )
        )
    return findings


def resolve_mode(params: dict[str, Any], enabled: list[str]) -> str:
    mode = str(params.get("mode") or "host").strip().lower()
    if mode not in MODES:
        mode = "host"
    if mode not in enabled:
        raise ValueError(f"Shodan mode {mode!r} is disabled by admin (enabled={enabled})")
    return mode


def handle_job(
    client: VbxModuleClient,
    job: ModuleJob,
    allowlist: set[str],
    *,
    api_key: str = "",
    use_mock: bool = False,
    modes_enabled: Optional[list[str]] = None,
    rate_hint: float = 1.0,
) -> None:
    enabled = list(modes_enabled or MODES)
    logger.info("claimed job %s target=%s params=%s", job.id, job.target, {k: job.params.get(k) for k in ("mode", "query")})
    client.job_heartbeat(job.id, progress=0.05, message="validating")

    try:
        mode = resolve_mode(job.params, enabled)
    except ValueError as exc:
        client.post_results(job.id, status="failed", findings=[], error=str(exc))
        return

    key = (api_key or os.environ.get("VBX_SHODAN_API_KEY") or "").strip()
    mock = use_mock or _mock_enabled()
    if not key and not mock:
        msg = "VBX_SHODAN_API_KEY is not set (enable VBX_SHODAN_MOCK=true for fixture)"
        client.post_results(job.id, status="failed", findings=[], error=msg)
        return

    query = str(job.params.get("query") or "").strip()
    target = (job.target or query or "").strip()

    try:
        if mode == "search":
            if not query and not target:
                client.post_results(job.id, status="failed", findings=[], error="search mode requires query or target")
                return
            q = query or target
            # Search itself is not a single host — we filter matches by allowlist
            client.job_heartbeat(job.id, progress=0.3, message=f"search {q[:80]}")
            if mock:
                data = dict(MOCK_SEARCH)
                raw = {"tool": "shodan_mock", "mode": "search", "query": q}
            else:
                data = fetch_shodan_search(q, key, rate_hint=rate_hint)
                raw = {"tool": "shodan", "mode": "search", "query": q, "total": data.get("total")}
            findings = search_to_findings(q, data, allowlist)
        elif mode == "dns":
            names_raw = query or target
            if not names_raw:
                client.post_results(job.id, status="failed", findings=[], error="dns mode requires hostname(s)")
                return
            hostnames = [x.strip() for x in names_raw.replace(";", ",").split(",") if x.strip()]
            for hn in hostnames:
                if not target_allowed(hn, allowlist):
                    client.post_results(
                        job.id,
                        status="failed",
                        findings=[],
                        error=f"hostname {hn!r} is not in VBX_SCAN_ALLOWLIST",
                    )
                    return
            client.job_heartbeat(job.id, progress=0.3, message=f"dns resolve {len(hostnames)} name(s)")
            if mock:
                mapping = {hn: "8.8.8.8" for hn in hostnames}
                raw = {"tool": "shodan_mock", "mode": "dns", "mapping": mapping}
            else:
                mapping = fetch_shodan_dns_resolve(hostnames, key, rate_hint=rate_hint)
                raw = {"tool": "shodan", "mode": "dns", "mapping": mapping}
            findings = dns_to_findings(hostnames, mapping, allowlist)
        else:  # host
            if not target:
                client.post_results(job.id, status="failed", findings=[], error="host mode requires target")
                return
            if not target_allowed(target, allowlist):
                msg = f"target {target!r} is not in VBX_SCAN_ALLOWLIST"
                logger.warning(msg)
                client.post_results(job.id, status="failed", findings=[], error=msg)
                return
            try:
                ip = resolve_ip(target)
            except Exception as exc:  # noqa: BLE001
                client.post_results(job.id, status="failed", findings=[], error=str(exc))
                return
            if not target_allowed(ip, allowlist) and not target_allowed(target, allowlist):
                msg = f"resolved IP {ip} is not in VBX_SCAN_ALLOWLIST"
                client.post_results(job.id, status="failed", findings=[], error=msg)
                return
            client.job_heartbeat(job.id, progress=0.3, message=f"lookup {ip}")
            if mock:
                host = dict(MOCK_HOST)
                host["ip_str"] = ip
                raw = {"tool": "shodan_mock", "mode": "host", "host": host}
            else:
                host = fetch_shodan_host(ip, key, rate_hint=rate_hint)
                raw = {
                    "tool": "shodan",
                    "mode": "host",
                    "host": {
                        k: host.get(k)
                        for k in ("ip_str", "org", "isp", "asn", "ports", "hostnames", "domains", "vulns", "tags")
                    },
                }
            findings = host_to_findings(target, ip, host)

        client.job_heartbeat(job.id, progress=0.9, message=f"{len(findings)} finding(s)")
        client.post_results(job.id, status="success", findings=findings, raw=raw)
        logger.info("job %s completed: %d finding(s)", job.id, len(findings))
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.id)
        client.post_results(job.id, status="failed", findings=[], error=str(exc))


def _refresh_runtime(client: VbxModuleClient) -> tuple[set[str], str, bool, list[str], float]:
    cfg = client.fetch_runtime_config()
    allowlist = merge_allowlist(
        os.environ.get("VBX_SCAN_ALLOWLIST"),
        str(cfg.get("allowlist") or ""),
        list(DEFAULT_ALLOWLIST),
    )
    # Prefer docker/env secret; optionally pull once from Core (shodan-scoped POST).
    key = (os.environ.get("VBX_SHODAN_API_KEY") or "").strip()
    if not key:
        try:
            key = (client.fetch_shodan_api_key() or "").strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning("shodan key fetch failed: %s", exc)
            key = ""
    mock = bool(cfg.get("shodan_mock")) if "shodan_mock" in cfg else _mock_enabled()
    modes = cfg.get("shodan_modes_enabled")
    if not isinstance(modes, list) or not modes:
        modes = list(MODES)
    modes = [str(m).strip().lower() for m in modes if str(m).strip().lower() in MODES] or list(MODES)
    try:
        rate = float(cfg.get("shodan_rate_limit_hint") or 1)
    except (TypeError, ValueError):
        rate = 1.0
    if MODULE_ID in (cfg.get("disabled_modules") or []):
        logger.warning("module %s disabled in Core settings", MODULE_ID)
    return allowlist, key, mock, modes, rate


def main() -> None:
    allowlist = parse_allowlist(os.environ.get("VBX_SCAN_ALLOWLIST"), list(DEFAULT_ALLOWLIST))
    api_key = (os.environ.get("VBX_SHODAN_API_KEY") or "").strip()
    use_mock = _mock_enabled()
    modes = list(MODES)
    rate_hint = 1.0
    logger.info(
        "shodan worker starting; allowlist=%s mock=%s key=%s",
        sorted(allowlist),
        use_mock,
        "set" if api_key else "missing",
    )

    client = VbxModuleClient(
        module_id=MODULE_ID,
        capabilities=["enrichment.shodan", "shodan.host", "shodan.search", "shodan.dns", "finding.v1"],
        version="0.2.0",
    )
    try:
        client.register(meta={"mock": use_mock, "modes": modes})
        allowlist, api_key, use_mock, modes, rate_hint = _refresh_runtime(client)
    except Exception as exc:  # noqa: BLE001
        logger.warning("register failed: %s", exc)

    client.start_heartbeat_loop(interval_sec=float(os.environ.get("VBX_MODULE_HB_INTERVAL", "15")))
    poll_n = 0
    try:
        while True:
            if poll_n % 12 == 0:
                try:
                    allowlist, api_key, use_mock, modes, rate_hint = _refresh_runtime(client)
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
            handle_job(
                client,
                job,
                allowlist,
                api_key=api_key,
                use_mock=use_mock,
                modes_enabled=modes,
                rate_hint=rate_hint,
            )
    except KeyboardInterrupt:
        logger.info("shutting down")
    finally:
        client.stop_heartbeat_loop()


if __name__ == "__main__":
    main()
