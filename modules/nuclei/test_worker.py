"""Unit tests for nuclei JSONL parsing / options (no nuclei binary required)."""

from __future__ import annotations

import sys
from pathlib import Path

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
sys.path.insert(0, str(_SDK))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from worker import (  # noqa: E402
    build_nuclei_command,
    hits_to_findings,
    nuclei_severity,
    parse_nuclei_jsonl,
    resolve_scan_options,
)
from vbx_module_sdk import normalize_http_target, target_allowed  # noqa: E402


SAMPLE_JSONL = """
{"template-id":"http-missing-security-headers","info":{"name":"HTTP Missing Security Headers","severity":"info","description":"missing headers","tags":["misc","headers"]},"type":"http","host":"http://scan-target","matched-at":"http://scan-target/","extracted-results":["X-Frame-Options","X-Content-Type-Options"]}
{"template-id":"CVE-2021-44228","info":{"name":"Apache Log4j RCE","severity":"critical","description":"log4shell","classification":{"cve-id":["CVE-2021-44228"]},"tags":["cve","rce"]},"type":"http","matched-at":"http://scan-target/api","host":"scan-target"}
{"template-id":"ssl-weak-cipher","info":{"name":"Weak Cipher","severity":"medium"},"matched-at":"scan-target:443","type":"ssl"}
not-json-line
{"broken":
"""


def test_normalize_and_allowlist():
    assert normalize_http_target("scan-target") == "http://scan-target"
    assert target_allowed("http://scan-target", {"scan-target"})
    assert target_allowed("scan-target", {"http://scan-target"})
    assert not target_allowed("evil.example", {"scan-target"})


def test_parse_nuclei_jsonl():
    hits = parse_nuclei_jsonl(SAMPLE_JSONL)
    assert len(hits) == 3
    assert hits[0]["template-id"] == "http-missing-security-headers"
    assert hits[1]["info"]["severity"] == "critical"
    assert hits[2]["info"]["severity"] == "medium"


def test_severity_mapping():
    assert nuclei_severity({"info": {"severity": "critical"}}) == "critical"
    assert nuclei_severity({"info": {"severity": "high"}}) == "high"
    assert nuclei_severity({"info": {"severity": "medium"}}) == "medium"
    assert nuclei_severity({"info": {"severity": "low"}}) == "low"
    assert nuclei_severity({"info": {"severity": "info"}}) == "info"
    assert nuclei_severity({"info": {"severity": "informational"}}) == "info"
    assert nuclei_severity({"severity": "unknown"}) == "info"


def test_hits_to_findings():
    hits = parse_nuclei_jsonl(SAMPLE_JSONL)
    findings = hits_to_findings("http://scan-target", hits)
    assert len(findings) == 3
    assert findings[0]["severity"] == "info"
    assert findings[0]["evidence"]["template_id"] == "http-missing-security-headers"
    assert findings[0]["evidence"]["extracted_results"] == [
        "X-Frame-Options",
        "X-Content-Type-Options",
    ]
    assert findings[0]["evidence"]["matched_at"] == "http://scan-target/"
    assert findings[1]["severity"] == "critical"
    assert findings[1]["title"] == "Apache Log4j RCE"
    assert "CVE-2021-44228" in findings[1]["cve_ids"]
    assert findings[2]["severity"] == "medium"
    assert findings[0]["schema"] == "finding.v1"
    assert findings[0]["module_id"] == "nuclei"


def test_resolve_scan_options_templates_as_tags():
    opts = resolve_scan_options(
        {"templates": "cve,misconfig", "severity": "high,critical", "rate_limit": 50},
        {"nuclei_default_templates": "", "nuclei_rate_limit": 150},
    )
    assert opts["tags"] == ["cve", "misconfig"]
    assert opts["templates"] == []
    assert opts["severity"] == ["high", "critical"]
    assert opts["rate_limit"] == 50


def test_resolve_scan_options_path_and_defaults():
    opts = resolve_scan_options(
        {"tags": "ssl", "exclude_tags": "dos,fuzz", "concurrency": 25},
        {"nuclei_default_templates": "/root/nuclei-templates", "nuclei_rate_limit": 100},
    )
    assert opts["templates"] == ["/root/nuclei-templates"]
    assert opts["tags"] == ["ssl"]
    assert opts["exclude_tags"] == ["dos", "fuzz"]
    assert opts["concurrency"] == 25
    assert opts["rate_limit"] == 100


def test_build_nuclei_command():
    opts = {
        "templates": ["/tpl"],
        "tags": ["cve"],
        "exclude_tags": ["dos"],
        "severity": ["high"],
        "rate_limit": 80,
        "concurrency": 10,
    }
    cmd = build_nuclei_command("http://scan-target", opts, "/tmp/out.jsonl")
    assert "-u" in cmd and "http://scan-target" in cmd
    assert "-jsonl" in cmd
    assert "-o" in cmd and "/tmp/out.jsonl" in cmd
    assert "-t" in cmd and "/tpl" in cmd
    assert "-tags" in cmd and "cve" in cmd
    assert "-exclude-tags" in cmd
    assert "-severity" in cmd and "high" in cmd
    assert "-rate-limit" in cmd and "80" in cmd
    assert "-c" in cmd and "10" in cmd
