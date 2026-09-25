"""
VBXSystem Asset Discovery worker.

Params: targets (CIDR / host list), optional ports.
Discovers live hosts via lightweight TCP connect and/or DNS resolve.
Mock mode: VBX_DISCOVERY_MOCK=true returns canned hosts (no network).
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
import sys
import time
from pathlib import Path
from typing import Any, Iterable, Optional

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

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
logger = logging.getLogger("vbx.discovery")

MODULE_ID = "discovery"
DEFAULT_ALLOWLIST = (
    "127.0.0.1",
    "scan-target",
    "host.docker.internal",
    "10.0.0.0/8",
)
DEFAULT_PORTS = (22, 80, 443, 8000, 3000)
POLL_INTERVAL = float(os.environ.get("VBX_SCAN_POLL_INTERVAL", "5"))
CONNECT_TIMEOUT = float(os.environ.get("VBX_DISCOVERY_CONNECT_TIMEOUT", "1.0"))
MAX_HOSTS = int(os.environ.get("VBX_DISCOVERY_MAX_HOSTS", "256"))

# Canned mock hosts for offline / CI (VBX_DISCOVERY_MOCK=true).
MOCK_HOSTS: list[dict[str, Any]] = [
    {
        "ip": "10.0.0.10",
        "hostname": "scan-target",
        "ports": [80, 443],
        "alive": True,
        "method": "mock",
    },
    {
        "ip": "10.0.0.11",
        "hostname": "db.internal",
        "ports": [22, 5432],
        "alive": True,
        "method": "mock",
    },
    {
        "ip": "10.0.0.12",
        "hostname": None,
        "ports": [8000],
        "alive": True,
        "method": "mock",
    },
]

RUNTIME: dict[str, Any] = {
    "discovery_default_ports": ",".join(str(p) for p in DEFAULT_PORTS),
    "discovery_connect_timeout": CONNECT_TIMEOUT,
    "discovery_max_hosts": MAX_HOSTS,
}


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _mock_enabled() -> bool:
    return str(os.environ.get("VBX_DISCOVERY_MOCK", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def parse_ports(raw: Any) -> list[int]:
    """Parse '22,80,443' or '8000-8002' into a sorted unique port list."""
    if raw is None or str(raw).strip() == "":
        return list(DEFAULT_PORTS)
    if isinstance(raw, (list, tuple)):
        out: list[int] = []
        for item in raw:
            try:
                p = int(item)
            except (TypeError, ValueError):
                continue
            if 1 <= p <= 65535:
                out.append(p)
        return sorted(set(out)) or list(DEFAULT_PORTS)
    ports: list[int] = []
    for part in str(raw).replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            try:
                lo, hi = int(a), int(b)
            except ValueError:
                continue
            lo, hi = max(1, min(lo, 65535)), max(1, min(hi, 65535))
            if lo > hi:
                lo, hi = hi, lo
            ports.extend(range(lo, hi + 1))
        else:
            try:
                p = int(part)
            except ValueError:
                continue
            if 1 <= p <= 65535:
                ports.append(p)
    return sorted(set(ports)) or list(DEFAULT_PORTS)


def parse_targets(raw: Any) -> list[str]:
    """Normalize targets from list, JSON-ish string, comma / newline separated text."""
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        return [str(x).strip() for x in raw if str(x).strip()]
    text = str(raw).strip()
    if not text:
        return []
    # Flatten newlines and commas.
    parts: list[str] = []
    for line in text.replace(";", "\n").splitlines():
        for chunk in line.split(","):
            item = chunk.strip()
            if item:
                parts.append(item)
    return parts


def expand_targets(targets: Iterable[str], *, max_hosts: int = MAX_HOSTS) -> list[str]:
    """Expand CIDRs into individual IPs (capped). Hostnames / single IPs pass through."""
    out: list[str] = []
    seen: set[str] = set()
    for entry in targets:
        item = (entry or "").strip()
        if not item:
            continue
        try:
            if "/" in item:
                net = ipaddress.ip_network(item, strict=False)
                for host in net.hosts():
                    s = str(host)
                    if s not in seen:
                        seen.add(s)
                        out.append(s)
                    if len(out) >= max_hosts:
                        return out
                # /32 or /31 may have no .hosts(); include network address
                if net.num_addresses <= 2:
                    for addr in net:
                        s = str(addr)
                        if s not in seen:
                            seen.add(s)
                            out.append(s)
                        if len(out) >= max_hosts:
                            return out
                continue
            # Single IP
            ipaddress.ip_address(item)
            key = item.lower()
            if key not in seen:
                seen.add(key)
                out.append(item)
            if len(out) >= max_hosts:
                return out
            continue
        except ValueError:
            pass
        # Hostname
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
        if len(out) >= max_hosts:
            return out
    return out


def resolve_scan_options(
    params: dict[str, Any],
    defaults: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    d = {**RUNTIME, **(defaults or {})}
    ports_raw = params.get("ports")
    if ports_raw is None or str(ports_raw).strip() == "":
        ports_raw = d.get("discovery_default_ports") or ""
    try:
        timeout = float(
            params.get("connect_timeout")
            or params.get("timeout")
            or d.get("discovery_connect_timeout")
            or CONNECT_TIMEOUT
        )
    except (TypeError, ValueError):
        timeout = CONNECT_TIMEOUT
    timeout = max(0.1, min(timeout, 10.0))
    try:
        max_hosts = int(params.get("max_hosts") or d.get("discovery_max_hosts") or MAX_HOSTS)
    except (TypeError, ValueError):
        max_hosts = MAX_HOSTS
    max_hosts = max(1, min(max_hosts, 1024))
    return {
        "ports": parse_ports(ports_raw),
        "connect_timeout": timeout,
        "max_hosts": max_hosts,
    }


def targets_from_job(job: ModuleJob) -> list[str]:
    """Collect targets from params.targets / params.target / job.target."""
    params = job.params or {}
    collected = parse_targets(params.get("targets"))
    if not collected:
        collected = parse_targets(params.get("target") or job.target)
    return collected


def dns_resolve(host: str) -> Optional[str]:
    """Resolve hostname to first IPv4/IPv6 address; return None on failure."""
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return None
    for family, _type, _proto, _canon, sockaddr in infos:
        if family == socket.AF_INET and sockaddr:
            return sockaddr[0]
        if family == socket.AF_INET6 and sockaddr:
            return sockaddr[0]
    return None


def tcp_probe_ports(host: str, ports: list[int], *, timeout: float) -> list[int]:
    """Return ports that accept a TCP connect (lightweight, no banner grab)."""
    open_ports: list[int] = []
    for port in ports:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                open_ports.append(port)
        except OSError:
            continue
    return open_ports


def probe_host(
    target: str,
    ports: list[int],
    *,
    timeout: float,
) -> Optional[dict[str, Any]]:
    """
    Lightweight discovery for one host/IP.
    Alive if DNS resolves (hostname) or any TCP port connects (or host is IP and ICMP-less: try ports).
    """
    hostname: Optional[str] = None
    ip: Optional[str] = None
    try:
        ipaddress.ip_address(target)
        ip = target
    except ValueError:
        hostname = target
        ip = dns_resolve(target)
        if not ip:
            return None

    open_ports = tcp_probe_ports(ip, ports, timeout=timeout)
    # IP with no open ports: still report as discovered only if DNS-resolved hostname
    # (DNS alone is enough for hostnames). For bare IPs require at least one open port
    # so we do not invent "alive" for every address in a CIDR.
    if not open_ports:
        if hostname:
            return {
                "ip": ip,
                "hostname": hostname,
                "ports": [],
                "alive": True,
                "method": "dns",
            }
        return None

    return {
        "ip": ip,
        "hostname": hostname,
        "ports": open_ports,
        "alive": True,
        "method": "tcp" if not hostname else "dns+tcp",
    }


def discover_hosts(
    targets: list[str],
    *,
    ports: list[int],
    timeout: float,
    max_hosts: int = MAX_HOSTS,
    mock: Optional[bool] = None,
) -> list[dict[str, Any]]:
    """Discover alive hosts for the given targets. Mock returns canned results."""
    use_mock = _mock_enabled() if mock is None else mock
    if use_mock:
        # Filter mock hosts to those overlapping requested targets when possible.
        expanded = expand_targets(targets, max_hosts=max_hosts) if targets else []
        if not expanded:
            return [dict(h) for h in MOCK_HOSTS]
        wanted_ips = {t for t in expanded}
        wanted_names = {t.lower() for t in expanded}
        matched = [
            dict(h)
            for h in MOCK_HOSTS
            if h["ip"] in wanted_ips
            or (h.get("hostname") and str(h["hostname"]).lower() in wanted_names)
            or any("/" in t for t in targets)  # CIDR request → return all canned
        ]
        return matched or [dict(h) for h in MOCK_HOSTS]

    expanded = expand_targets(targets, max_hosts=max_hosts)
    found: list[dict[str, Any]] = []
    for host in expanded:
        result = probe_host(host, ports, timeout=timeout)
        if result:
            found.append(result)
    return found


def host_to_finding(host: dict[str, Any]) -> dict[str, Any]:
    ip = str(host.get("ip") or "")
    hostname = host.get("hostname")
    ports = list(host.get("ports") or [])
    title = f"Discovered host {ip or hostname or 'unknown'}"
    evidence: dict[str, Any] = {
        "module": MODULE_ID,
        "ip": ip,
        "hostname": hostname,
        "ports": ports,
        "method": host.get("method"),
        "mock": host.get("method") == "mock",
    }
    asset_ports = [{"port": p, "protocol": "tcp", "state": "open"} for p in ports]
    target = ip or str(hostname or "")
    f = finding_v1(
        finding_type="discovered_host",
        title=title[:200],
        target=target,
        severity="info",
        description=f"Host {ip}"
        + (f" ({hostname})" if hostname else "")
        + " responded during asset discovery"
        + (" (mock)" if evidence["mock"] else "")
        + ".",
        evidence=evidence,
        tags=["discovery", "host", "asset"],
        module_id=MODULE_ID,
        ports=asset_ports or None,
    )
    # Ensure both ip and hostname land in asset when known.
    if ip:
        f["asset"]["ip"] = ip
    if hostname:
        f["asset"]["hostname"] = hostname
    return f


def allowlist_check_targets(targets: list[str], allowlist: set[str]) -> Optional[str]:
    """Return error message if any target entry is off-allowlist; else None."""
    if not targets:
        return "missing targets (provide params.targets or params.target)"
    for entry in targets:
        if not target_allowed(entry, allowlist):
            # CIDR: allow if the network itself or any parent CIDR covers it via expand check
            try:
                if "/" in entry:
                    net = ipaddress.ip_network(entry, strict=False)
                    covered = False
                    for al in allowlist:
                        try:
                            if "/" in al:
                                parent = ipaddress.ip_network(al, strict=False)
                                if net.subnet_of(parent) or net == parent:
                                    covered = True
                                    break
                            else:
                                addr = ipaddress.ip_address(al)
                                if addr in net and net.num_addresses == 1:
                                    covered = True
                                    break
                        except ValueError:
                            continue
                    if covered:
                        continue
            except ValueError:
                pass
            return f"target {entry!r} is not in VBX_SCAN_ALLOWLIST"
    return None


def handle_job(
    client: VbxModuleClient,
    job: ModuleJob,
    allowlist: set[str],
    *,
    defaults: Optional[dict[str, Any]] = None,
) -> None:
    logger.info("claimed job %s", job.id)
    client.job_heartbeat(job.id, progress=0.05, message="validating targets")

    targets = targets_from_job(job)
    err = allowlist_check_targets(targets, allowlist)
    if err:
        logger.warning(err)
        client.post_results(job.id, status="failed", findings=[], error=err)
        return

    opts = resolve_scan_options(job.params, defaults)
    client.job_heartbeat(
        job.id,
        progress=0.15,
        message=f"discovering {len(targets)} target(s) max={opts['max_hosts']}",
    )

    try:
        hosts = discover_hosts(
            targets,
            ports=opts["ports"],
            timeout=opts["connect_timeout"],
            max_hosts=opts["max_hosts"],
        )
        findings = [host_to_finding(h) for h in hosts]
        auto_scan_hint = {"module_id": "nmap", "reason": "discovery"}
        raw: dict[str, Any] = {
            "tool": "discovery_mock" if _mock_enabled() else "discovery",
            "targets": targets,
            "options": {
                "ports": opts["ports"],
                "connect_timeout": opts["connect_timeout"],
                "max_hosts": opts["max_hosts"],
            },
            "hosts": hosts,
            "host_count": len(hosts),
            "mock": _mock_enabled(),
            # Surfaces in job progress_json via SDK post_results({"raw": raw}).
            "auto_scan_hint": auto_scan_hint,
        }
        client.job_heartbeat(
            job.id,
            progress=0.9,
            message=f"found {len(hosts)} host(s); hint nmap",
        )
        # Final progress also carries the hint when Core stores the heartbeat payload.
        # Results path is the durable store: raw.auto_scan_hint → progress_json.raw.
        client.post_results(job.id, status="success", findings=findings, raw=raw)
        logger.info("job %s completed: %d host(s)", job.id, len(hosts))
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.id)
        client.post_results(job.id, status="failed", findings=[], error=str(exc))


def _apply_runtime(cfg: dict[str, Any]) -> dict[str, Any]:
    global CONNECT_TIMEOUT, MAX_HOSTS
    for key in RUNTIME:
        if key in cfg and cfg[key] is not None:
            RUNTIME[key] = cfg[key]
    if cfg.get("discovery_connect_timeout") is not None:
        try:
            CONNECT_TIMEOUT = max(0.1, min(float(cfg["discovery_connect_timeout"]), 10.0))
            RUNTIME["discovery_connect_timeout"] = CONNECT_TIMEOUT
        except (TypeError, ValueError):
            pass
    if cfg.get("discovery_max_hosts") is not None:
        try:
            MAX_HOSTS = max(1, min(int(cfg["discovery_max_hosts"]), 1024))
            RUNTIME["discovery_max_hosts"] = MAX_HOSTS
        except (TypeError, ValueError):
            pass
    if cfg.get("discovery_default_ports"):
        RUNTIME["discovery_default_ports"] = str(cfg["discovery_default_ports"])
    return dict(RUNTIME)


def main() -> None:
    allowlist = parse_allowlist(os.environ.get("VBX_SCAN_ALLOWLIST"), list(DEFAULT_ALLOWLIST))
    defaults = dict(RUNTIME)
    logger.info(
        "discovery worker starting; allowlist=%s mock=%s",
        sorted(allowlist),
        _mock_enabled(),
    )

    client = VbxModuleClient(
        module_id=MODULE_ID,
        capabilities=["host_discovery", "finding.v1"],
        version="0.1.0",
    )
    try:
        client.register(meta={"mock": _mock_enabled()})
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
