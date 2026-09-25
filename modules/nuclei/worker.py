"""
VBXSystem ProjectDiscovery nuclei worker.

Runs nuclei against allowlisted URL/host/IP targets.
Parses JSONL (-jsonl) into finding.v1 findings with severity mapping.
Mock mode: VBX_NUCLEI_MOCK=true (tests / no binary).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

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
logger = logging.getLogger("vbx.nuclei")

MODULE_ID = "nuclei"
DEFAULT_ALLOWLIST = (
    "127.0.0.1",
    "scan-target",
    "http://scan-target",
    "https://scan-target",
    "host.docker.internal",
    "http://host.docker.internal",
)
POLL_INTERVAL = float(os.environ.get("VBX_SCAN_POLL_INTERVAL", "5"))
NUCLEI_TIMEOUT = int(os.environ.get("VBX_NUCLEI_TIMEOUT", "900"))

RUNTIME: dict[str, Any] = {
    "nuclei_default_templates": os.environ.get("VBX_NUCLEI_TEMPLATES")
    or os.environ.get("VBX_NUCLEI_DEFAULT_TEMPLATES")
    or "/app/artifacts/nuclei-templates",
    "nuclei_rate_limit": int(os.environ.get("VBX_NUCLEI_RATE_LIMIT", "150") or 150),
}

# Nuclei severity → finding.v1 severity
SEVERITY_MAP = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "info",
    "informational": "info",
    "unknown": "info",
}


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _mock_enabled() -> bool:
    return _as_bool(os.environ.get("VBX_NUCLEI_MOCK"), False)


def _find_nuclei() -> Optional[str]:
    path = shutil.which("nuclei")
    if path:
        return path
    for candidate in ("/usr/local/bin/nuclei", "/usr/bin/nuclei"):
        if Path(candidate).is_file():
            return candidate
    return None


def _split_csv(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        return [str(x).strip() for x in raw if str(x).strip()]
    text = str(raw).strip()
    if not text:
        return []
    # Support comma or space separation
    parts: list[str] = []
    for chunk in text.replace(";", ",").split(","):
        for bit in chunk.split():
            if bit.strip():
                parts.append(bit.strip())
    return parts


def _looks_like_path(value: str) -> bool:
    if not value:
        return False
    if value.startswith(("/", "./", "../", "~")):
        return True
    if "\\" in value or "/" in value:
        return True
    if value.endswith((".yaml", ".yml", ".json")):
        return True
    return False


def _custom_templates_dir() -> Path:
    raw = (
        os.environ.get("VBX_NUCLEI_CUSTOM_DIR")
        or "/app/artifacts/nuclei-custom"
    ).strip()
    return Path(raw)


def _resolve_template_path(item: str) -> str:
    """Map bare .yaml names to custom/official dirs when present on disk."""
    if item.startswith(("/", "./", "../", "~")) or "\\" in item or "/" in item:
        return item
    if not item.endswith((".yaml", ".yml")):
        return item
    custom = _custom_templates_dir() / item
    if custom.is_file():
        return str(custom)
    official = Path(
        os.environ.get("VBX_NUCLEI_TEMPLATES")
        or RUNTIME.get("nuclei_default_templates")
        or "/app/artifacts/nuclei-templates"
    )
    candidate = official / item
    if candidate.is_file():
        return str(candidate)
    # Prefer custom path even if missing so nuclei error is clear
    return str(custom)


def resolve_scan_options(params: dict[str, Any], defaults: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Merge job params over admin/runtime defaults."""
    d = {**RUNTIME, **(defaults or {})}

    templates_raw = params.get("templates")
    if templates_raw is None or str(templates_raw).strip() == "":
        templates_raw = d.get("nuclei_default_templates") or ""

    tags = _split_csv(params.get("tags"))
    exclude_tags = _split_csv(params.get("exclude_tags") or params.get("exclude-tags"))
    severity = _split_csv(params.get("severity"))

    # templates may be a path OR comma-separated tags when no path-like value
    templates_list = _split_csv(templates_raw)
    template_paths: list[str] = []
    template_as_tags: list[str] = []
    for item in templates_list:
        if _looks_like_path(item):
            template_paths.append(_resolve_template_path(item))
        else:
            # treat as tag unless tags already set and this looks like a single word tag
            template_as_tags.append(item)

    if template_as_tags and not tags and not template_paths:
        # Job passed templates="cve,misconfig" meaning tags
        tags = template_as_tags
        template_paths = []
    elif template_paths and template_as_tags:
        # Mixed: paths go to -t, extra words to tags (merge)
        tags = list(dict.fromkeys([*tags, *template_as_tags]))

    rate_limit = params.get("rate_limit", params.get("rate-limit", d.get("nuclei_rate_limit", 150)))
    try:
        rate_limit_i = max(1, min(int(rate_limit), 10000))
    except (TypeError, ValueError):
        rate_limit_i = int(d.get("nuclei_rate_limit") or 150)

    concurrency = params.get("concurrency", params.get("c"))
    try:
        concurrency_i = max(1, min(int(concurrency), 500)) if concurrency not in (None, "") else None
    except (TypeError, ValueError):
        concurrency_i = None

    timeout = params.get("timeout") or params.get("max_duration") or NUCLEI_TIMEOUT
    try:
        timeout_i = max(30, min(int(timeout), 7200))
    except (TypeError, ValueError):
        timeout_i = NUCLEI_TIMEOUT

    return {
        "templates": template_paths,
        "tags": tags,
        "exclude_tags": exclude_tags,
        "severity": [s.lower() for s in severity],
        "rate_limit": rate_limit_i,
        "concurrency": concurrency_i,
        "timeout": timeout_i,
    }


def build_nuclei_command(target: str, opts: dict[str, Any], jsonl_path: str) -> list[str]:
    """Build nuclei argv. Always -jsonl for parseable output."""
    binary = _find_nuclei() or "nuclei"
    cmd = [
        binary,
        "-u",
        target,
        "-jsonl",
        "-o",
        jsonl_path,
        "-silent",
        "-no-color",
        "-rate-limit",
        str(opts["rate_limit"]),
    ]
    for path in opts.get("templates") or []:
        cmd.extend(["-t", path])
    if opts.get("tags"):
        cmd.extend(["-tags", ",".join(opts["tags"])])
    if opts.get("exclude_tags"):
        cmd.extend(["-exclude-tags", ",".join(opts["exclude_tags"])])
    if opts.get("severity"):
        cmd.extend(["-severity", ",".join(opts["severity"])])
    if opts.get("concurrency"):
        cmd.extend(["-c", str(opts["concurrency"])])
    return cmd


def parse_nuclei_jsonl(text: str) -> list[dict[str, Any]]:
    """Parse nuclei -jsonl output into a list of result dicts."""
    results: list[dict[str, Any]] = []
    if not (text or "").strip():
        return results
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            results.append(obj)
    return results


def nuclei_severity(hit: dict[str, Any]) -> str:
    info = hit.get("info") if isinstance(hit.get("info"), dict) else {}
    raw = str(
        hit.get("severity")
        or info.get("severity")
        or "info"
    ).strip().lower()
    return SEVERITY_MAP.get(raw, "info")


def hits_to_findings(target: str, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    host = urlparse(normalize_http_target(target)).hostname or target
    findings: list[dict[str, Any]] = []
    for hit in hits:
        info = hit.get("info") if isinstance(hit.get("info"), dict) else {}
        template_id = str(
            hit.get("template-id")
            or hit.get("template_id")
            or hit.get("templateID")
            or info.get("id")
            or "nuclei"
        )
        name = str(info.get("name") or hit.get("name") or template_id)
        severity = nuclei_severity(hit)
        matched_at = str(
            hit.get("matched-at")
            or hit.get("matched_at")
            or hit.get("matched")
            or hit.get("host")
            or target
        )
        extracted = (
            hit.get("extracted-results")
            or hit.get("extracted_results")
            or hit.get("extractor-name")
            or []
        )
        description = str(info.get("description") or "")[:2000]
        cve_ids: list[str] = []
        classification = info.get("classification") if isinstance(info.get("classification"), dict) else {}
        for cve in classification.get("cve-id") or classification.get("cve_id") or []:
            if isinstance(cve, str) and cve.upper().startswith("CVE-"):
                cve_ids.append(cve.upper())
        for ref in info.get("reference") or []:
            if isinstance(ref, str) and "CVE-" in ref.upper():
                # best-effort; skip non-CVE refs
                pass
        tags = ["nuclei", severity, template_id]
        for t in info.get("tags") or []:
            if isinstance(t, str) and t.strip():
                tags.append(t.strip())

        findings.append(
            finding_v1(
                finding_type="nuclei_match",
                title=name[:200],
                target=host,
                severity=severity,
                description=description,
                evidence={
                    "template_id": template_id,
                    "name": name,
                    "severity": severity,
                    "matched_at": matched_at,
                    "extracted_results": extracted,
                    "type": hit.get("type"),
                    "host": hit.get("host"),
                    "ip": hit.get("ip"),
                    "curl_command": hit.get("curl-command") or hit.get("curl_command"),
                    "matcher_name": hit.get("matcher-name") or hit.get("matcher_name"),
                },
                tags=tags[:32],
                module_id=MODULE_ID,
                cve_ids=cve_ids,
            )
        )
    return findings


def _mock_hits(target: str) -> list[dict[str, Any]]:
    return [
        {
            "template-id": "mock-missing-header",
            "info": {
                "name": "Mock Missing Security Header",
                "severity": "low",
                "description": "Simulated nuclei finding for local tests",
                "tags": ["mock", "misc"],
            },
            "matched-at": normalize_http_target(target),
            "host": target,
            "type": "http",
            "extracted-results": ["X-Frame-Options"],
        },
        {
            "template-id": "mock-info-banner",
            "info": {
                "name": "Mock Informational Banner",
                "severity": "info",
                "description": "Simulated info-level match",
                "tags": ["mock"],
            },
            "matched-at": normalize_http_target(target),
            "type": "http",
        },
    ]


def run_nuclei(target: str, opts: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    binary = _find_nuclei()
    if not binary:
        if _mock_enabled():
            hits = _mock_hits(target)
            return hits, {"tool": "nuclei_mock", "reason": "nuclei binary not found", "hits": len(hits)}
        raise RuntimeError(
            "nuclei binary not found in PATH. Install ProjectDiscovery nuclei "
            "or set VBX_NUCLEI_MOCK=true for test mode."
        )

    with tempfile.NamedTemporaryFile(prefix="vbx-nuclei-", suffix=".jsonl", delete=False) as tmp:
        jsonl_path = tmp.name
    try:
        cmd = build_nuclei_command(target, opts, jsonl_path)
        # Ensure argv uses resolved binary
        cmd[0] = binary
        logger.info("running: %s", " ".join(cmd))
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=int(opts.get("timeout") or NUCLEI_TIMEOUT),
            check=False,
        )
        jsonl_text = ""
        try:
            jsonl_text = Path(jsonl_path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            jsonl_text = ""
        # Some versions also emit JSONL on stdout when -o is used; prefer file
        if not jsonl_text.strip() and (proc.stdout or "").strip():
            jsonl_text = proc.stdout or ""
        hits = parse_nuclei_jsonl(jsonl_text)
        raw: dict[str, Any] = {
            "tool": "nuclei",
            "command": cmd,
            "returncode": proc.returncode,
            "stdout_tail": (proc.stdout or "")[-2000:],
            "stderr_tail": (proc.stderr or "")[-2000:],
            "options": {k: v for k, v in opts.items() if v not in (None, "", [])},
            "hit_count": len(hits),
        }
        # nuclei: 0 = ok (may have matches), non-zero often still has partial results
        if proc.returncode not in (0, 1) and not hits:
            raise RuntimeError(
                f"nuclei failed rc={proc.returncode}: {(proc.stderr or proc.stdout or '')[:500]}"
            )
        return hits, raw
    finally:
        try:
            Path(jsonl_path).unlink(missing_ok=True)
        except OSError:
            pass


def scan_target(target: str, opts: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if _mock_enabled() and not _find_nuclei():
        hits = _mock_hits(target)
        return hits, {"tool": "nuclei_mock", "hits": len(hits)}
    return run_nuclei(target, opts)


def normalize_scan_target(target: str) -> str:
    """Pass through URLs; leave bare host/IP as-is for nuclei -u."""
    t = (target or "").strip()
    if not t:
        return ""
    if "://" in t:
        return t
    # Bare host/IP — nuclei accepts without scheme; keep original for IP scans
    return t


def handle_job(
    client: VbxModuleClient,
    job: ModuleJob,
    allowlist: set[str],
    *,
    defaults: Optional[dict[str, Any]] = None,
) -> None:
    logger.info("claimed job %s target=%s", job.id, job.target)
    client.job_heartbeat(job.id, progress=0.05, message="validating target")

    raw_target = (job.target or "").strip()
    if not raw_target:
        client.post_results(job.id, status="failed", findings=[], error="missing target")
        return

    url_form = normalize_http_target(raw_target)
    if not target_allowed(raw_target, allowlist) and not target_allowed(url_form, allowlist):
        msg = f"target {raw_target!r} is not in VBX_SCAN_ALLOWLIST"
        logger.warning(msg)
        client.post_results(job.id, status="failed", findings=[], error=msg)
        return

    opts = resolve_scan_options(job.params, defaults)
    scan_target_str = normalize_scan_target(raw_target)
    client.job_heartbeat(
        job.id,
        progress=0.15,
        message=f"nuclei rate={opts['rate_limit']} tags={opts['tags'] or '-'}",
    )

    try:
        hits, raw = scan_target(scan_target_str, opts)
        findings = hits_to_findings(raw_target, hits)
        client.job_heartbeat(job.id, progress=0.9, message=f"{len(findings)} match(es)")
        client.post_results(job.id, status="success", findings=findings, raw=raw)
        logger.info("job %s completed: %d finding(s)", job.id, len(findings))
    except subprocess.TimeoutExpired:
        client.post_results(
            job.id,
            status="failed",
            findings=[],
            error=f"nuclei timeout after {opts['timeout']}s",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.id)
        client.post_results(job.id, status="failed", findings=[], error=str(exc))


def _apply_runtime(cfg: dict[str, Any]) -> dict[str, Any]:
    if cfg.get("nuclei_default_templates") is not None:
        RUNTIME["nuclei_default_templates"] = str(cfg["nuclei_default_templates"] or "")
    if cfg.get("nuclei_rate_limit") is not None:
        try:
            RUNTIME["nuclei_rate_limit"] = max(1, min(int(cfg["nuclei_rate_limit"]), 10000))
        except (TypeError, ValueError):
            pass
    return dict(RUNTIME)


def main() -> None:
    allowlist = parse_allowlist(os.environ.get("VBX_SCAN_ALLOWLIST"), list(DEFAULT_ALLOWLIST))
    defaults = dict(RUNTIME)
    binary = _find_nuclei()
    logger.info(
        "nuclei worker starting; binary=%s mock=%s allowlist=%s",
        binary or "MISSING",
        _mock_enabled(),
        sorted(allowlist),
    )

    client = VbxModuleClient(
        module_id=MODULE_ID,
        capabilities=["vuln.template", "finding.v1"],
        version="0.1.0",
    )
    try:
        client.register(meta={"templates": bool(RUNTIME.get("nuclei_default_templates"))})
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
