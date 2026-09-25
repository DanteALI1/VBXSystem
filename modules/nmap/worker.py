"""
VBXSystem nmap scanner worker.

Profiles: quick, default, full, udp, vuln-scripts.
Parses nmap XML into findings (open ports, services, OS, script output).
Falls back to a pure-Python TCP connect probe if the nmap binary is missing.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Optional

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

from vbx_module_sdk import ModuleJob, VbxModuleClient, finding_v1, merge_allowlist  # noqa: E402

logging.basicConfig(
    level=os.environ.get("VBX_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vbx.nmap")

MODULE_ID = "nmap"
DEFAULT_PORTS = (22, 80, 443, 8000, 3000)
DEFAULT_ALLOWLIST = ("127.0.0.1", "scan-target", "host.docker.internal")
POLL_INTERVAL = float(os.environ.get("VBX_SCAN_POLL_INTERVAL", "5"))
NMAP_TIMEOUT = int(os.environ.get("VBX_NMAP_TIMEOUT", "600"))

PROFILES = ("quick", "default", "full", "udp", "vuln-scripts")
# Safe NSE subset for vuln-scripts profile (no exploit / brute)
VULN_NSE_SUBSET = "vuln,safe,auth,default"
RUNTIME_DEFAULTS: dict[str, Any] = {
    "nmap_default_ports": "",
    "nmap_default_profile": "default",
    "nmap_default_timing": 3,
    "nmap_default_sv": False,
    "nmap_default_os": False,
    "nmap_default_aggressive": False,
    "nmap_default_scripts": "",
    "nmap_default_top_ports": "",
    "nmap_default_exclude": "",
}


def _parse_allowlist(raw: Optional[str]) -> set[str]:
    items = [x.strip().lower() for x in (raw or "").split(",") if x.strip()]
    if not items:
        items = list(DEFAULT_ALLOWLIST)
    return {x.lower() for x in items}


def _parse_ports(raw: Optional[str]) -> list[int]:
    if not raw:
        return list(DEFAULT_PORTS)
    ports: list[int] = []
    for part in raw.replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            ports.extend(range(int(a), int(b) + 1))
        else:
            ports.append(int(part))
    return sorted(set(ports))


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def target_allowed(target: str, allowlist: set[str]) -> bool:
    """Allow exact host/IP match or IP inside an allowlisted CIDR."""
    t = (target or "").strip().lower()
    if not t:
        return False
    if t.startswith("[") and "]" in t:
        t = t[1 : t.index("]")]
    host = t.rsplit("%", 1)[0]
    if host in allowlist:
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


def resolve_scan_options(params: dict[str, Any], defaults: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Merge job params over admin/runtime defaults."""
    d = {**RUNTIME_DEFAULTS, **(defaults or {})}
    profile = str(params.get("profile") or d.get("nmap_default_profile") or "default").strip().lower()
    if profile not in PROFILES:
        profile = "default"

    ports_raw = params.get("ports")
    if ports_raw is None or str(ports_raw).strip() == "":
        ports_raw = d.get("nmap_default_ports") or ""

    top_ports = params.get("top_ports")
    if top_ports is None or str(top_ports).strip() == "":
        top_ports = d.get("nmap_default_top_ports") or ""

    timing = params.get("timing", d.get("nmap_default_timing", 3))
    try:
        timing_i = max(0, min(int(timing), 5))
    except (TypeError, ValueError):
        timing_i = 3

    scripts = params.get("scripts")
    if scripts is None or str(scripts).strip() == "":
        scripts = d.get("nmap_default_scripts") or ""

    exclude = params.get("exclude")
    if exclude is None or str(exclude).strip() == "":
        exclude = d.get("nmap_default_exclude") or ""

    return {
        "profile": profile,
        "ports": str(ports_raw or "").strip(),
        "top_ports": str(top_ports or "").strip(),
        "timing": timing_i,
        "service_detection": _as_bool(params.get("service_detection", params.get("sv")), d.get("nmap_default_sv", False)),
        "os_detection": _as_bool(params.get("os_detection", params.get("O")), d.get("nmap_default_os", False)),
        "aggressive": _as_bool(params.get("aggressive", params.get("A")), d.get("nmap_default_aggressive", False)),
        "scripts": str(scripts or "").strip(),
        "exclude": str(exclude or "").strip(),
    }


def build_nmap_command(target: str, opts: dict[str, Any], xml_path: str) -> list[str]:
    """Build nmap argv from profile + options. Always -oX for parseable output."""
    profile = opts["profile"]
    cmd = ["nmap", "-Pn", f"-T{opts['timing']}", "-oX", xml_path]

    if profile == "quick":
        cmd.extend(["-sT", "--top-ports", "100"])
    elif profile == "full":
        cmd.extend(["-sT", "-p-"])
        if not opts["aggressive"]:
            cmd.append("-sV")
    elif profile == "udp":
        cmd.extend(["-sU", "--top-ports", str(opts["top_ports"] or "50")])
    elif profile == "vuln-scripts":
        cmd.extend(["-sT", "--script", opts["scripts"] or VULN_NSE_SUBSET])
        if opts["ports"]:
            cmd.extend(["-p", opts["ports"]])
        elif opts["top_ports"]:
            cmd.extend(["--top-ports", str(opts["top_ports"])])
        else:
            cmd.extend(["-p", ",".join(str(p) for p in DEFAULT_PORTS)])
    else:  # default
        cmd.append("-sT")
        if opts["ports"]:
            cmd.extend(["-p", opts["ports"]])
        elif opts["top_ports"]:
            cmd.extend(["--top-ports", str(opts["top_ports"])])
        else:
            cmd.extend(["-p", ",".join(str(p) for p in DEFAULT_PORTS)])

    # Profile-specific port overrides for quick/full already set; allow explicit ports on quick
    if profile == "quick" and opts["ports"]:
        # replace --top-ports with explicit -p if provided
        if "--top-ports" in cmd:
            idx = cmd.index("--top-ports")
            cmd[idx : idx + 2] = ["-p", opts["ports"]]

    if opts["aggressive"]:
        cmd.append("-A")
    else:
        if opts["service_detection"] and "-sV" not in cmd and profile != "udp":
            cmd.append("-sV")
        if opts["os_detection"]:
            cmd.append("-O")
        if opts["scripts"] and profile != "vuln-scripts":
            cmd.extend(["--script", opts["scripts"]])

    if opts["exclude"]:
        cmd.extend(["--exclude", opts["exclude"]])

    cmd.append(target)
    return cmd


def parse_nmap_xml(xml_text: str) -> dict[str, Any]:
    """Parse nmap -oX output into structured host/port/os/script data."""
    result: dict[str, Any] = {
        "hosts": [],
        "open_ports": [],
        "os_matches": [],
        "scripts": [],
    }
    if not (xml_text or "").strip():
        return result
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        result["parse_error"] = str(exc)
        return result

    for host in root.findall("host"):
        status = host.find("status")
        if status is not None and status.get("state") == "down":
            continue
        addrs = []
        for addr in host.findall("address"):
            addrs.append({"addr": addr.get("addr"), "type": addr.get("addrtype")})
        hostnames = []
        for hn in host.findall("./hostnames/hostname"):
            if hn.get("name"):
                hostnames.append(hn.get("name"))

        host_scripts: list[dict[str, Any]] = []
        for script in host.findall("./hostscript/script"):
            host_scripts.append(
                {"id": script.get("id"), "output": (script.get("output") or "")[:4000]}
            )

        ports_out: list[dict[str, Any]] = []
        for port_el in host.findall("./ports/port"):
            state_el = port_el.find("state")
            state = (state_el.get("state") if state_el is not None else "") or ""
            if state != "open":
                continue
            svc_el = port_el.find("service")
            port_info: dict[str, Any] = {
                "port": int(port_el.get("portid") or 0),
                "protocol": port_el.get("protocol") or "tcp",
                "state": "open",
                "service": (svc_el.get("name") if svc_el is not None else None) or None,
                "product": (svc_el.get("product") if svc_el is not None else None) or None,
                "version": (svc_el.get("version") if svc_el is not None else None) or None,
                "extrainfo": (svc_el.get("extrainfo") if svc_el is not None else None) or None,
                "scripts": [],
            }
            for script in port_el.findall("script"):
                sc = {"id": script.get("id"), "output": (script.get("output") or "")[:4000]}
                port_info["scripts"].append(sc)
                result["scripts"].append({**sc, "port": port_info["port"], "protocol": port_info["protocol"]})
            ports_out.append(port_info)
            result["open_ports"].append(port_info)

        os_matches: list[dict[str, Any]] = []
        for osm in host.findall("./os/osmatch"):
            os_matches.append(
                {
                    "name": osm.get("name"),
                    "accuracy": osm.get("accuracy"),
                    "line": osm.get("line"),
                }
            )
        result["os_matches"].extend(os_matches)
        result["scripts"].extend(host_scripts)
        result["hosts"].append(
            {
                "addresses": addrs,
                "hostnames": hostnames,
                "ports": ports_out,
                "os_matches": os_matches,
                "scripts": host_scripts,
            }
        )
    return result


def run_nmap(target: str, opts: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    with tempfile.NamedTemporaryFile(prefix="vbx-nmap-", suffix=".xml", delete=False) as tmp:
        xml_path = tmp.name
    try:
        cmd = build_nmap_command(target, opts, xml_path)
        logger.info("running: %s", " ".join(cmd))
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=NMAP_TIMEOUT,
            check=False,
        )
        xml_text = ""
        try:
            xml_text = Path(xml_path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            xml_text = ""
        parsed = parse_nmap_xml(xml_text)
        raw = {
            "tool": "nmap",
            "command": cmd,
            "returncode": proc.returncode,
            "stdout_tail": (proc.stdout or "")[-2000:],
            "stderr_tail": (proc.stderr or "")[-2000:],
            "profile": opts["profile"],
            "options": {k: v for k, v in opts.items() if k != "exclude" or v},
            "parsed_hosts": len(parsed.get("hosts") or []),
        }
        if proc.returncode not in (0, 1) and not parsed.get("open_ports"):
            # nmap: 0=ok, 1=hosts down / no results often still ok
            raw["warning"] = f"nmap rc={proc.returncode}"
        return parsed, raw
    finally:
        try:
            Path(xml_path).unlink(missing_ok=True)
        except OSError:
            pass


def probe_ports_python(target: str, ports: list[int]) -> tuple[dict[str, Any], dict[str, Any]]:
    """TCP connect probe when nmap binary is unavailable."""
    open_ports: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []
    for port in ports:
        ok = False
        err: Optional[str] = None
        try:
            with socket.create_connection((target, port), timeout=2.0):
                ok = True
        except OSError as exc:
            err = str(exc)
        details.append({"port": port, "open": ok, "error": err})
        if ok:
            open_ports.append(
                {"port": port, "protocol": "tcp", "state": "open", "service": None, "scripts": []}
            )
    parsed = {"hosts": [], "open_ports": open_ports, "os_matches": [], "scripts": []}
    raw = {"tool": "python_probe", "target": target, "details": details}
    return parsed, raw


FALLBACK_LIMITATION = (
    "nmap binary unavailable — used pure-Python TCP connect probe only. "
    "No OS detection, NSE scripts, UDP, version detection, or timing profiles."
)


def scan_target(target: str, opts: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run nmap when present; otherwise degrade to TCP connect probe with explicit raw flags.

    UDP / vuln-scripts profiles require the real binary — they fail instead of silently
    pretending a TCP probe is equivalent.
    """
    nmap_bin = shutil.which("nmap")
    if nmap_bin:
        try:
            return run_nmap(target, opts)
        except (subprocess.TimeoutExpired, OSError) as exc:
            reason = f"nmap execution failed: {exc}"
            logger.warning("%s; considering python probe", reason)
    else:
        reason = "nmap binary not found on PATH"

    profile = opts.get("profile") or "default"
    if profile == "udp":
        raise RuntimeError(
            f"{reason or 'nmap unavailable'}. "
            "UDP profile requires the nmap binary (-sU); Python TCP probe cannot substitute."
        )
    if profile == "vuln-scripts":
        raise RuntimeError(
            f"{reason or 'nmap unavailable'}. "
            "vuln-scripts profile requires nmap NSE; Python TCP probe cannot substitute."
        )

    logger.warning("%s; using python TCP port probe (degraded)", reason or "nmap unavailable")
    ports = _parse_ports(opts.get("ports") or "")
    if opts.get("top_ports") and not opts.get("ports"):
        ports = list(DEFAULT_PORTS)
    parsed, raw = probe_ports_python(target, ports)
    raw["degraded"] = True
    raw["fallback"] = "python_tcp_probe"
    raw["fallback_reason"] = reason or "nmap unavailable"
    raw["limitation"] = FALLBACK_LIMITATION
    raw["requested_profile"] = profile
    raw["requested_options"] = {
        k: opts.get(k)
        for k in (
            "timing",
            "service_detection",
            "os_detection",
            "aggressive",
            "scripts",
            "exclude",
            "top_ports",
        )
    }
    return parsed, raw


def parsed_to_findings(target: str, parsed: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for p in parsed.get("open_ports") or []:
        port = p["port"]
        proto = p.get("protocol") or "tcp"
        svc = p.get("service")
        product = p.get("product")
        version = p.get("version")
        title = f"Open port {port}/{proto}"
        if svc:
            title = f"{title} ({svc})"
        if product:
            title = f"{title} — {product}" + (f" {version}" if version else "")
        severity = "medium" if port in (22, 3389, 445, 1433, 3306) else "info"
        evidence = {k: v for k, v in p.items() if k != "scripts" or v}
        findings.append(
            finding_v1(
                finding_type="open_port",
                title=title,
                target=target,
                severity=severity,
                description=f"Port {port}/{proto} is open on {target}.",
                evidence=evidence,
                tags=["nmap", "port", f"port:{port}", f"proto:{proto}"],
                module_id=MODULE_ID,
                ports=[{"port": port, "protocol": proto, "state": "open"}],
            )
        )
        for sc in p.get("scripts") or []:
            sid = sc.get("id") or "script"
            out = (sc.get("output") or "").strip()
            if not out:
                continue
            findings.append(
                finding_v1(
                    finding_type="nmap_script",
                    title=f"NSE {sid} on {port}/{proto}",
                    target=target,
                    severity="medium" if "VULNERABLE" in out.upper() else "info",
                    description=out[:2000],
                    evidence={"script_id": sid, "port": port, "protocol": proto, "output": out[:4000]},
                    tags=["nmap", "nse", sid, f"port:{port}"],
                    module_id=MODULE_ID,
                    ports=[{"port": port, "protocol": proto, "state": "open"}],
                )
            )

    for osm in parsed.get("os_matches") or []:
        name = osm.get("name") or "unknown OS"
        findings.append(
            finding_v1(
                finding_type="os_guess",
                title=f"OS guess: {name}",
                target=target,
                severity="info",
                description=f"Nmap OS match accuracy={osm.get('accuracy')}",
                evidence=osm,
                tags=["nmap", "os"],
                module_id=MODULE_ID,
            )
        )

    for sc in parsed.get("scripts") or []:
        if sc.get("port"):
            continue  # already emitted with port
        sid = sc.get("id") or "script"
        out = (sc.get("output") or "").strip()
        if not out:
            continue
        findings.append(
            finding_v1(
                finding_type="nmap_script",
                title=f"NSE {sid}",
                target=target,
                severity="medium" if "VULNERABLE" in out.upper() else "info",
                description=out[:2000],
                evidence={"script_id": sid, "output": out[:4000]},
                tags=["nmap", "nse", sid],
                module_id=MODULE_ID,
            )
        )
    return findings


# Back-compat alias used by older tests
def ports_to_findings(target: str, open_ports: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return parsed_to_findings(target, {"open_ports": open_ports, "os_matches": [], "scripts": []})


def handle_job(
    client: VbxModuleClient,
    job: ModuleJob,
    allowlist: set[str],
    *,
    defaults: Optional[dict[str, Any]] = None,
) -> None:
    logger.info("claimed job %s target=%s", job.id, job.target)
    client.job_heartbeat(job.id, progress=0.05, message="validating target")

    if not target_allowed(job.target, allowlist):
        msg = f"target {job.target!r} is not in VBX_SCAN_ALLOWLIST"
        logger.warning(msg)
        client.post_results(job.id, status="failed", findings=[], error=msg)
        return

    opts = resolve_scan_options(job.params, defaults)
    # Exclude list must also be allowlist-safe: we only scan the primary target
    client.job_heartbeat(
        job.id,
        progress=0.15,
        message=f"profile={opts['profile']} timing=T{opts['timing']}",
    )

    try:
        parsed, raw = scan_target(job.target, opts)
        findings = parsed_to_findings(job.target, parsed)
        if raw.get("degraded"):
            findings.append(
                finding_v1(
                    finding_type="scan_degraded",
                    title="nmap unavailable — TCP probe fallback",
                    target=job.target,
                    severity="info",
                    description=str(raw.get("limitation") or FALLBACK_LIMITATION),
                    evidence={
                        "fallback": raw.get("fallback"),
                        "fallback_reason": raw.get("fallback_reason"),
                        "requested_profile": raw.get("requested_profile"),
                    },
                    tags=["nmap", "degraded", "fallback"],
                    module_id=MODULE_ID,
                )
            )
        msg = f"found {len(findings)} finding(s)"
        if raw.get("degraded"):
            msg = f"degraded TCP probe; {msg}"
        client.job_heartbeat(job.id, progress=0.9, message=msg)
        client.post_results(
            job.id,
            status="completed",
            findings=findings,
            raw={"open_ports": parsed.get("open_ports"), "os_matches": parsed.get("os_matches"), **raw},
        )
        logger.info("job %s completed: %d finding(s) degraded=%s", job.id, len(findings), bool(raw.get("degraded")))
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.id)
        client.post_results(job.id, status="failed", findings=[], error=str(exc))


def _apply_runtime(cfg: dict[str, Any]) -> dict[str, Any]:
    global NMAP_TIMEOUT
    for key in RUNTIME_DEFAULTS:
        if key in cfg and cfg[key] is not None:
            RUNTIME_DEFAULTS[key] = cfg[key]
    if cfg.get("nmap_default_ports"):
        os.environ["VBX_NMAP_PORTS"] = str(cfg["nmap_default_ports"])
    return dict(RUNTIME_DEFAULTS)


def main() -> None:
    allowlist = _parse_allowlist(os.environ.get("VBX_SCAN_ALLOWLIST"))
    defaults = dict(RUNTIME_DEFAULTS)
    logger.info("nmap worker starting; allowlist=%s", sorted(allowlist))

    client = VbxModuleClient(
        module_id=MODULE_ID,
        capabilities=["port_scan", "os_detect", "nse", "finding.v1"],
        version="0.2.0",
    )
    try:
        client.register(meta={"allowlist": sorted(allowlist), "profiles": list(PROFILES)})
        cfg = client.fetch_runtime_config()
        allowlist = merge_allowlist(
            os.environ.get("VBX_SCAN_ALLOWLIST"),
            str(cfg.get("allowlist") or ""),
            list(DEFAULT_ALLOWLIST),
        )
        defaults = _apply_runtime(cfg)
    except Exception as exc:  # noqa: BLE001
        logger.warning("register failed (will keep polling): %s", exc)

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
