"""Unit tests for Shodan finding mapping / modes (no live API)."""

from __future__ import annotations

import sys
from pathlib import Path

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
sys.path.insert(0, str(_SDK))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest
from worker import (  # noqa: E402
    MOCK_HOST,
    MOCK_SEARCH,
    dns_to_findings,
    host_to_findings,
    resolve_mode,
    search_to_findings,
)
from vbx_module_sdk import target_allowed  # noqa: E402


def test_allowlist_ip():
    assert target_allowed("8.8.8.8", {"8.8.8.8"})
    assert not target_allowed("1.1.1.1", {"8.8.8.8"})


def test_host_to_findings_mock():
    findings = host_to_findings("8.8.8.8", "8.8.8.8", MOCK_HOST)
    assert len(findings) >= 2
    assert any(f["finding_type"] == "shodan_host" for f in findings)
    assert any("CVE-2023-0001" in (f.get("cve_ids") or []) for f in findings)
    host_f = next(f for f in findings if f["finding_type"] == "shodan_host")
    assert "asn" in host_f["evidence"] or host_f["evidence"].get("isp")


def test_search_to_findings_filters_allowlist():
    findings = search_to_findings('port:443', MOCK_SEARCH, {"8.8.8.8"})
    assert any(f["finding_type"] == "shodan_search" for f in findings)
    assert any(f["finding_type"] == "shodan_match" for f in findings)
    blocked = search_to_findings('port:443', MOCK_SEARCH, {"1.1.1.1"})
    assert not any(f["finding_type"] == "shodan_match" for f in blocked)


def test_dns_to_findings():
    findings = dns_to_findings(["dns.google"], {"dns.google": "8.8.8.8"}, {"8.8.8.8", "dns.google"})
    assert findings[0]["finding_type"] == "shodan_dns"
    assert findings[0]["evidence"]["ip"] == "8.8.8.8"


def test_resolve_mode_respects_admin():
    assert resolve_mode({"mode": "search"}, ["host", "search", "dns"]) == "search"
    with pytest.raises(ValueError):
        resolve_mode({"mode": "search"}, ["host"])
