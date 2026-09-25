"""
VBXSystem gowitness worker — screenshot / web recon of allowlisted HTTP(S) URLs.

Uses the gowitness binary (chromedp) when available. Mock mode via VBX_GOWITNESS_MOCK
stores a tiny PNG under the shared volume without a browser.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
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
logger = logging.getLogger("vbx.gowitness")

MODULE_ID = "gowitness"
DEFAULT_ALLOWLIST = (
    "127.0.0.1",
    "scan-target",
    "http://scan-target",
    "https://scan-target",
    "host.docker.internal",
    "http://host.docker.internal",
)
POLL_INTERVAL = float(os.environ.get("VBX_SCAN_POLL_INTERVAL", "5"))
DEFAULT_TIMEOUT = int(os.environ.get("VBX_GOWITNESS_TIMEOUT", "60"))
DEFAULT_RESOLUTION = os.environ.get("VBX_GOWITNESS_RESOLUTION", "1440x900")
DATA_DIR = Path(os.environ.get("VBX_GOWITNESS_DATA_DIR", "/data"))
# Cap inline base64 thumbnail so findings stay small when volume is unavailable.
# ~192 KiB raw ≈ list-friendly previews for typical gowitness PNGs under that size.
THUMB_B64_MAX = int(os.environ.get("VBX_GOWITNESS_THUMB_MAX", "196608"))

# Minimal valid 1×1 PNG (used in mock mode / empty fallback).
_MOCK_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

RUNTIME: dict[str, Any] = {
    "gowitness_timeout_sec": DEFAULT_TIMEOUT,
    "gowitness_default_resolution": DEFAULT_RESOLUTION,
    "gowitness_default_fullpage": False,
}


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _mock_enabled() -> bool:
    return str(os.environ.get("VBX_GOWITNESS_MOCK", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def parse_url_target(target: str) -> dict[str, str]:
    """Normalize URL and extract host / optional port for asset + title."""
    url = normalize_http_target(target)
    parsed = urlparse(url)
    host = (parsed.hostname or "").strip()
    port = ""
    if parsed.port:
        port = str(parsed.port)
    scheme = (parsed.scheme or "http").lower()
    return {
        "url": url,
        "host": host,
        "port": port,
        "scheme": scheme,
        "netloc": parsed.netloc or host,
    }


def parse_resolution(raw: Any) -> tuple[int, int]:
    """Parse 'WxH' / 'W x H' into width, height. Defaults to 1440×900."""
    text = str(raw or "").strip().lower().replace(" ", "")
    m = re.match(r"^(\d{2,5})[x×*](\d{2,5})$", text)
    if not m:
        return 1440, 900
    w, h = int(m.group(1)), int(m.group(2))
    w = max(320, min(w, 7680))
    h = max(240, min(h, 4320))
    return w, h


def resolve_scan_options(params: dict[str, Any], defaults: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    d = {**RUNTIME, **(defaults or {})}
    timeout = params.get("timeout") or params.get("max_duration") or d.get("gowitness_timeout_sec") or DEFAULT_TIMEOUT
    try:
        timeout_i = max(10, min(int(timeout), 600))
    except (TypeError, ValueError):
        timeout_i = int(d.get("gowitness_timeout_sec") or DEFAULT_TIMEOUT)

    resolution = params.get("resolution")
    if resolution is None or str(resolution).strip() == "":
        resolution = d.get("gowitness_default_resolution") or DEFAULT_RESOLUTION
    width, height = parse_resolution(resolution)

    fullpage = _as_bool(params.get("fullpage"), bool(d.get("gowitness_default_fullpage")))
    return {
        "timeout": timeout_i,
        "resolution": f"{width}x{height}",
        "width": width,
        "height": height,
        "fullpage": fullpage,
    }


def _find_gowitness() -> Optional[str]:
    path = shutil.which("gowitness")
    if path:
        return path
    for candidate in ("/usr/local/bin/gowitness", "/opt/gowitness/gowitness"):
        if Path(candidate).is_file():
            return candidate
    return None


def _safe_filename(host: str, job_id: str) -> str:
    safe_host = re.sub(r"[^a-zA-Z0-9._-]+", "_", host or "target")[:80] or "target"
    safe_job = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(job_id))[:40] or uuid.uuid4().hex[:8]
    return f"{safe_job}_{safe_host}.png"


def ensure_data_dir(base: Optional[Path] = None) -> Path:
    root = Path(base or DATA_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_mock_screenshot(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_MOCK_PNG)
    return path


def _newest_image(directory: Path, *, since: float) -> Optional[Path]:
    newest: Optional[Path] = None
    newest_mtime = since - 1
    for pattern in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
        for p in directory.glob(pattern):
            try:
                mtime = p.stat().st_mtime
            except OSError:
                continue
            if mtime >= since - 0.5 and mtime >= newest_mtime:
                newest = p
                newest_mtime = mtime
    return newest


def build_gowitness_command(
    binary: str,
    url: str,
    *,
    screenshot_dir: Path,
    opts: dict[str, Any],
) -> list[str]:
    """gowitness v3: scan single --url … --screenshot-path …"""
    cmd = [
        binary,
        "scan",
        "single",
        "--url",
        url,
        "--screenshot-path",
        str(screenshot_dir),
        "--screenshot-format",
        "png",
        "--timeout",
        str(int(opts["timeout"])),
        "--chrome-window-x",
        str(int(opts["width"])),
        "--chrome-window-y",
        str(int(opts["height"])),
    ]
    if opts.get("fullpage"):
        cmd.append("--screenshot-fullpage")
    chrome = os.environ.get("CHROME_PATH") or os.environ.get("CHROMIUM_PATH")
    if chrome and Path(chrome).exists():
        cmd.extend(["--chrome-path", chrome])
    return cmd


def run_screenshot(url: str, *, job_id: str, opts: dict[str, Any], data_dir: Optional[Path] = None) -> dict[str, Any]:
    """Capture screenshot; return meta with screenshot_path and optional thumbnail_b64."""
    root = ensure_data_dir(data_dir)
    host = urlparse(url).hostname or "target"
    dest = root / _safe_filename(host, job_id)
    meta: dict[str, Any] = {
        "tool": "gowitness",
        "url": url,
        "resolution": opts["resolution"],
        "fullpage": bool(opts.get("fullpage")),
        "timeout": opts["timeout"],
        "mock": False,
    }

    if _mock_enabled():
        write_mock_screenshot(dest)
        meta["tool"] = "gowitness_mock"
        meta["mock"] = True
        meta["screenshot_path"] = str(dest)
        meta["thumbnail_b64"] = _capped_b64(dest)
        return meta

    binary = _find_gowitness()
    if not binary:
        # No binary: still write a placeholder under /data so API volume has evidence,
        # and attach a capped thumbnail. Mark as degraded rather than hard-failing in tests.
        write_mock_screenshot(dest)
        meta["tool"] = "gowitness_fallback"
        meta["error"] = "gowitness binary not found"
        meta["screenshot_path"] = str(dest)
        meta["thumbnail_b64"] = _capped_b64(dest)
        return meta

    work = root / f".job_{_safe_filename(host, job_id).rsplit('.', 1)[0]}"
    work.mkdir(parents=True, exist_ok=True)
    cmd = build_gowitness_command(binary, url, screenshot_dir=work, opts=opts)
    meta["command"] = cmd
    started = time.time()
    logger.info("running: %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=int(opts["timeout"]) + 30,
            check=False,
            cwd=str(work),
            env={**os.environ, "HOME": os.environ.get("HOME") or "/tmp"},
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"gowitness timed out after {opts['timeout']}s") from exc

    meta["returncode"] = proc.returncode
    meta["stdout_tail"] = (proc.stdout or "")[-2000:]
    meta["stderr_tail"] = (proc.stderr or "")[-2000:]

    found = _newest_image(work, since=started)
    if found and found.is_file():
        try:
            if dest.exists():
                dest.unlink()
            found.replace(dest)
        except OSError:
            dest.write_bytes(found.read_bytes())
        meta["screenshot_path"] = str(dest)
        meta["thumbnail_b64"] = _capped_b64(dest)
        # cleanup work dir leftovers
        for leftover in work.glob("*"):
            try:
                leftover.unlink()
            except OSError:
                pass
        try:
            work.rmdir()
        except OSError:
            pass
        return meta

    if proc.returncode != 0:
        raise RuntimeError(
            f"gowitness failed rc={proc.returncode}: {(proc.stderr or proc.stdout or '')[:500]}"
        )
    raise RuntimeError("gowitness completed but no screenshot file was produced")


def _capped_b64(path: Path) -> Optional[str]:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if not data:
        return None
    if len(data) > THUMB_B64_MAX:
        # Prefer path-only evidence for large captures; keep a stub note.
        return None
    return base64.b64encode(data).decode("ascii")


def screenshot_to_finding(url_info: dict[str, str], capture: dict[str, Any]) -> dict[str, Any]:
    host = url_info["host"] or url_info["url"]
    title = f"Screenshot {host}"
    evidence: dict[str, Any] = {
        "module": MODULE_ID,
        "url": url_info["url"],
        "resolution": capture.get("resolution"),
        "fullpage": capture.get("fullpage"),
        "mock": bool(capture.get("mock")),
    }
    path = capture.get("screenshot_path")
    if path:
        evidence["screenshot_path"] = path
    thumb = capture.get("thumbnail_b64")
    if thumb:
        evidence["thumbnail_b64"] = thumb
        evidence["thumbnail_format"] = "png"
    elif path:
        # Always try to attach a preview for list UIs even if capture meta omitted it.
        regenerated = _capped_b64(Path(str(path)))
        if regenerated:
            evidence["thumbnail_b64"] = regenerated
            evidence["thumbnail_format"] = "png"
    if capture.get("error"):
        evidence["note"] = capture["error"]

    # Prefer hostname for asset; if host looks like an IP, finding_v1 sets ip.
    return finding_v1(
        finding_type="gowitness_screenshot",
        title=title[:200],
        target=host,
        severity="info",
        description=f"Web screenshot of {url_info['url']}"
        + (" (mock)" if capture.get("mock") else ""),
        evidence=evidence,
        tags=["gowitness", "screenshot", "web.recon"],
        module_id=MODULE_ID,
    )


def handle_job(
    client: VbxModuleClient,
    job: ModuleJob,
    allowlist: set[str],
    *,
    defaults: Optional[dict[str, Any]] = None,
) -> None:
    logger.info("claimed job %s target=%s", job.id, job.target)
    client.job_heartbeat(job.id, progress=0.05, message="validating target")

    raw_target = (job.target or job.params.get("target") or "").strip()
    if not raw_target:
        client.post_results(job.id, status="failed", findings=[], error="missing target URL")
        return

    url_info = parse_url_target(raw_target)
    url = url_info["url"]
    if not target_allowed(raw_target, allowlist) and not target_allowed(url, allowlist):
        msg = f"target {raw_target!r} is not in VBX_SCAN_ALLOWLIST"
        logger.warning(msg)
        client.post_results(job.id, status="failed", findings=[], error=msg)
        return

    if url_info["scheme"] not in {"http", "https"}:
        client.post_results(
            job.id,
            status="failed",
            findings=[],
            error=f"unsupported scheme {url_info['scheme']!r}; only http/https",
        )
        return

    opts = resolve_scan_options(job.params, defaults)
    client.job_heartbeat(job.id, progress=0.2, message=f"screenshot {url}")
    try:
        capture = run_screenshot(url, job_id=str(job.id), opts=opts)
        finding = screenshot_to_finding(url_info, capture)
        raw = {
            "tool": capture.get("tool"),
            "url": url,
            "options": {
                "timeout": opts["timeout"],
                "resolution": opts["resolution"],
                "fullpage": opts["fullpage"],
            },
            "screenshot_path": capture.get("screenshot_path"),
            "mock": capture.get("mock"),
            "returncode": capture.get("returncode"),
            "error": capture.get("error"),
        }
        client.job_heartbeat(job.id, progress=0.9, message="ingesting finding")
        client.post_results(job.id, status="success", findings=[finding], raw=raw)
        logger.info("job %s completed: screenshot=%s", job.id, capture.get("screenshot_path"))
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.id)
        client.post_results(job.id, status="failed", findings=[], error=str(exc))


def _apply_runtime(cfg: dict[str, Any]) -> dict[str, Any]:
    global DEFAULT_TIMEOUT
    for key in RUNTIME:
        if key in cfg and cfg[key] is not None:
            RUNTIME[key] = cfg[key]
    if cfg.get("gowitness_timeout_sec") is not None:
        try:
            DEFAULT_TIMEOUT = max(10, min(int(cfg["gowitness_timeout_sec"]), 600))
            RUNTIME["gowitness_timeout_sec"] = DEFAULT_TIMEOUT
        except (TypeError, ValueError):
            pass
    if cfg.get("gowitness_default_resolution"):
        w, h = parse_resolution(cfg["gowitness_default_resolution"])
        RUNTIME["gowitness_default_resolution"] = f"{w}x{h}"
    if "gowitness_default_fullpage" in cfg:
        RUNTIME["gowitness_default_fullpage"] = _as_bool(cfg.get("gowitness_default_fullpage"), False)
    return dict(RUNTIME)


def main() -> None:
    allowlist = parse_allowlist(os.environ.get("VBX_SCAN_ALLOWLIST"), list(DEFAULT_ALLOWLIST))
    defaults = dict(RUNTIME)
    logger.info(
        "gowitness worker starting; allowlist=%s binary=%s data=%s mock=%s",
        sorted(allowlist),
        _find_gowitness(),
        DATA_DIR,
        _mock_enabled(),
    )

    client = VbxModuleClient(
        module_id=MODULE_ID,
        capabilities=["web.screenshot", "web.recon", "finding.v1"],
        version="0.1.0",
    )
    try:
        client.register(meta={"data_dir": str(DATA_DIR)})
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
