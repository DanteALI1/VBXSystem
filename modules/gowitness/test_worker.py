"""Unit tests for gowitness URL parsing / mock findings (no browser binary)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
sys.path.insert(0, str(_SDK))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from worker import (  # noqa: E402
    build_gowitness_command,
    parse_resolution,
    parse_url_target,
    resolve_scan_options,
    run_screenshot,
    screenshot_to_finding,
)
from vbx_module_sdk import normalize_http_target, target_allowed  # noqa: E402


def test_normalize_and_allowlist():
    assert normalize_http_target("scan-target") == "http://scan-target"
    assert target_allowed("http://scan-target", {"scan-target"})
    assert target_allowed("scan-target", {"http://scan-target"})
    assert not target_allowed("https://evil.example", {"scan-target"})


def test_parse_url_target():
    info = parse_url_target("https://app.example:8443/login")
    assert info["scheme"] == "https"
    assert info["host"] == "app.example"
    assert info["port"] == "8443"
    assert info["url"] == "https://app.example:8443/login"

    bare = parse_url_target("10.0.0.5")
    assert bare["url"] == "http://10.0.0.5"
    assert bare["host"] == "10.0.0.5"


def test_parse_resolution():
    assert parse_resolution("1920x1080") == (1920, 1080)
    assert parse_resolution("800×600") == (800, 600)
    assert parse_resolution("bad") == (1440, 900)
    assert parse_resolution(None) == (1440, 900)


def test_resolve_scan_options():
    opts = resolve_scan_options(
        {"timeout": 45, "resolution": "1280x720", "fullpage": True},
        {"gowitness_timeout_sec": 60, "gowitness_default_fullpage": False},
    )
    assert opts["timeout"] == 45
    assert opts["resolution"] == "1280x720"
    assert opts["width"] == 1280
    assert opts["height"] == 720
    assert opts["fullpage"] is True

    defaults = resolve_scan_options({}, {"gowitness_default_resolution": "1024x768"})
    assert defaults["resolution"] == "1024x768"
    assert defaults["fullpage"] is False


def test_build_gowitness_command():
    cmd = build_gowitness_command(
        "/usr/local/bin/gowitness",
        "http://scan-target",
        screenshot_dir=Path("/data"),
        opts={"timeout": 30, "width": 1440, "height": 900, "fullpage": True},
    )
    assert cmd[0] == "/usr/local/bin/gowitness"
    assert "scan" in cmd and "single" in cmd
    assert "--url" in cmd and "http://scan-target" in cmd
    assert "--screenshot-fullpage" in cmd
    assert "--chrome-window-x" in cmd and "1440" in cmd
    assert "--chrome-window-y" in cmd and "900" in cmd


def test_mock_screenshot_finding(tmp_path, monkeypatch):
    monkeypatch.setenv("VBX_GOWITNESS_MOCK", "true")
    opts = resolve_scan_options({"timeout": 20, "resolution": "800x600"})
    capture = run_screenshot(
        "http://scan-target/app",
        job_id="42",
        opts=opts,
        data_dir=tmp_path,
    )
    assert capture["mock"] is True
    assert capture["screenshot_path"]
    path = Path(capture["screenshot_path"])
    assert path.is_file()
    assert path.stat().st_size > 0
    assert capture.get("thumbnail_b64")

    info = parse_url_target("http://scan-target/app")
    finding = screenshot_to_finding(info, capture)
    assert finding["title"] == "Screenshot scan-target"
    assert finding["severity"] == "info"
    assert finding["finding_type"] == "gowitness_screenshot"
    assert finding["module_id"] == "gowitness"
    assert finding["asset"]["hostname"] == "scan-target"
    assert finding["evidence"]["screenshot_path"] == str(path)
    assert finding["evidence"]["url"] == "http://scan-target/app"
    assert finding["evidence"]["module"] == "gowitness"
    assert finding["evidence"].get("thumbnail_b64")


def test_allowlist_blocks_offlist_host():
    assert not target_allowed("https://not-allowed.internal", {"scan-target", "127.0.0.1"})
