"""Unit tests for ZAP alert mapping / scan options (no live ZAP)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
sys.path.insert(0, str(_SDK))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from worker import (  # noqa: E402
    ZapUnavailableError,
    alerts_to_findings,
    resolve_scan_options,
    risk_to_severity,
    run_zap_scan,
    _extract_alerts,
)
from vbx_module_sdk import normalize_http_target, target_allowed  # noqa: E402


def test_normalize_and_allowlist():
    assert normalize_http_target("scan-target") == "http://scan-target"
    assert target_allowed("http://scan-target", {"scan-target"})
    assert target_allowed("scan-target", {"http://scan-target"})


def test_extract_and_map_alerts():
    report = {
        "site": [
            {
                "alerts": [
                    {
                        "name": "X-Content-Type-Options Header Missing",
                        "riskcode": "1",
                        "riskdesc": "Low (Medium)",
                        "desc": "missing header",
                        "url": "http://scan-target/",
                        "pluginid": "10021",
                    },
                    {
                        "name": "SQL Injection",
                        "riskcode": "3",
                        "desc": "sqli",
                        "url": "http://scan-target/q",
                        "pluginid": "40018",
                    },
                    {
                        "name": "Informational Banner",
                        "riskcode": "0",
                        "riskdesc": "Informational",
                        "desc": "info",
                        "url": "http://scan-target/",
                        "pluginid": "10009",
                    },
                ]
            }
        ]
    }
    alerts = _extract_alerts(report)
    assert len(alerts) == 3
    findings = alerts_to_findings("http://scan-target", alerts, scan_type="full")
    assert findings[0]["severity"] == "low"
    assert findings[1]["severity"] == "high"
    assert findings[2]["severity"] == "info"
    assert findings[1]["evidence"]["scan_type"] == "full"


def test_risk_mapping_all_levels():
    assert risk_to_severity({"riskcode": "0"}) == "info"
    assert risk_to_severity({"riskcode": "1"}) == "low"
    assert risk_to_severity({"riskcode": "2"}) == "medium"
    assert risk_to_severity({"riskcode": "3"}) == "high"
    assert risk_to_severity({"riskdesc": "High (3)"}) == "high"


def test_resolve_scan_options():
    opts = resolve_scan_options(
        {
            "scan_type": "spider",
            "ajax_spider": True,
            "max_duration": 600,
            "auth": {"context_name": "ctx", "user": "u1"},
        },
        {"zap_default_scan_type": "baseline"},
    )
    assert opts["scan_type"] == "spider"
    assert opts["ajax_spider"] is True
    assert opts["max_duration"] == 600
    assert opts["context_name"] == "ctx"
    assert opts["context_user"] == "u1"


def test_resolve_scan_options_credential_and_form_fields():
    opts = resolve_scan_options(
        {
            "scan_type": "full",
            "credential_id": 7,
            "login_url": "https://app/login",
            "username_field": "email",
            "password_field": "pwd",
        },
        {"zap_default_credential_id": 3},
    )
    assert opts["credential_id"] == 7
    assert opts["login_url"] == "https://app/login"
    assert opts["username_field"] == "email"
    assert opts["password_field"] == "pwd"

    opts2 = resolve_scan_options({}, {"zap_default_credential_id": 3})
    assert opts2["credential_id"] == 3
    assert opts2["username_field"] == "username"
    assert opts2["password_field"] == "password"


def test_spider_fails_clearly_without_daemon(monkeypatch):
    import worker as w

    monkeypatch.delenv("VBX_ZAP_MOCK", raising=False)
    monkeypatch.setattr(w, "_zap_api_available", lambda: False)
    monkeypatch.setattr(w, "_find_script", lambda *a: "/fake/zap-baseline.py")
    opts = resolve_scan_options({"scan_type": "spider"}, {})
    with pytest.raises(ZapUnavailableError, match="refusing to silently"):
        run_zap_scan("http://scan-target", opts)


def test_spider_mock_when_enabled(monkeypatch):
    import worker as w

    monkeypatch.setenv("VBX_ZAP_MOCK", "true")
    monkeypatch.setattr(w, "_zap_api_available", lambda: False)
    opts = resolve_scan_options({"scan_type": "spider"}, {})
    alerts, raw = run_zap_scan("http://scan-target", opts)
    assert raw.get("mock") is True
    assert len(alerts) >= 1


def test_full_fails_without_script_or_daemon(monkeypatch):
    import worker as w

    monkeypatch.delenv("VBX_ZAP_MOCK", raising=False)
    monkeypatch.setattr(w, "_zap_api_available", lambda: False)
    monkeypatch.setattr(w, "_find_script", lambda *a: None)
    opts = resolve_scan_options({"scan_type": "full"}, {})
    with pytest.raises(ZapUnavailableError, match="refusing to silently"):
        run_zap_scan("http://scan-target", opts)
