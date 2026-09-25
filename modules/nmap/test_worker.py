"""Unit tests for nmap allowlist / XML parse / profiles (no Core required)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "modules" / "_sdk" / "python"))
sys.path.insert(0, str(_ROOT / "modules" / "nmap"))

from worker import (  # noqa: E402
    build_nmap_command,
    parse_nmap_xml,
    parsed_to_findings,
    ports_to_findings,
    resolve_scan_options,
    target_allowed,
)

SAMPLE_XML = """<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.0.5" addrtype="ipv4"/>
    <hostnames><hostname name="scan-target" type="user"/></hostnames>
    <ports>
      <port protocol="tcp" portid="80">
        <state state="open"/>
        <service name="http" product="nginx" version="1.25"/>
        <script id="http-title" output="Welcome"/>
      </port>
      <port protocol="tcp" portid="22">
        <state state="closed"/>
      </port>
    </ports>
    <os>
      <osmatch name="Linux 5.x" accuracy="95" line="1"/>
    </os>
    <hostscript>
      <script id="smb-os-discovery" output="OS: Linux"/>
    </hostscript>
  </host>
</nmaprun>
"""


def test_allowlist_localhost_and_scan_target():
    allow = {"127.0.0.1", "scan-target", "host.docker.internal"}
    assert target_allowed("127.0.0.1", allow)
    assert target_allowed("scan-target", allow)
    assert target_allowed("host.docker.internal", allow)
    assert not target_allowed("8.8.8.8", allow)
    assert not target_allowed("evil.example", allow)


def test_allowlist_cidr():
    allow = {"10.0.0.0/8"}
    assert target_allowed("10.1.2.3", allow)
    assert not target_allowed("192.168.1.1", allow)


def test_finding_v1_open_ports():
    findings = ports_to_findings(
        "scan-target",
        [{"port": 80, "protocol": "tcp", "state": "open", "service": "http"}],
    )
    assert len(findings) == 1
    f = findings[0]
    assert f["schema"] == "finding.v1"
    assert f["finding_type"] == "open_port"
    assert f["target"] == "scan-target"
    assert f["evidence"]["port"] == 80


def test_parse_nmap_xml_and_findings():
    parsed = parse_nmap_xml(SAMPLE_XML)
    assert len(parsed["open_ports"]) == 1
    assert parsed["open_ports"][0]["port"] == 80
    assert parsed["open_ports"][0]["product"] == "nginx"
    assert parsed["os_matches"][0]["name"] == "Linux 5.x"
    findings = parsed_to_findings("scan-target", parsed)
    types = {f["finding_type"] for f in findings}
    assert "open_port" in types
    assert "os_guess" in types
    assert "nmap_script" in types


def test_resolve_options_and_profiles():
    opts = resolve_scan_options(
        {"profile": "vuln-scripts", "timing": 4, "service_detection": True},
        {"nmap_default_ports": "80,443"},
    )
    assert opts["profile"] == "vuln-scripts"
    assert opts["timing"] == 4
    assert opts["service_detection"] is True
    cmd = build_nmap_command("scan-target", opts, "/tmp/out.xml")
    assert "nmap" in cmd[0]
    assert "-oX" in cmd
    assert "--script" in cmd
    assert "-T4" in cmd

    quick = resolve_scan_options({"profile": "quick"}, {})
    qcmd = build_nmap_command("t", quick, "/tmp/q.xml")
    assert "--top-ports" in qcmd or "-p" in qcmd


def test_udp_and_vuln_refuse_python_fallback(monkeypatch):
    import worker as w

    monkeypatch.setattr(w.shutil, "which", lambda _name: None)
    with pytest.raises(RuntimeError, match="UDP"):
        w.scan_target("127.0.0.1", resolve_scan_options({"profile": "udp"}, {}))
    with pytest.raises(RuntimeError, match="vuln-scripts"):
        w.scan_target("127.0.0.1", resolve_scan_options({"profile": "vuln-scripts"}, {}))


def test_python_fallback_marks_degraded(monkeypatch):
    import worker as w

    monkeypatch.setattr(w.shutil, "which", lambda _name: None)
    parsed, raw = w.scan_target(
        "127.0.0.1",
        resolve_scan_options({"profile": "default", "ports": "1"}, {}),
    )
    assert raw.get("degraded") is True
    assert raw.get("fallback") == "python_tcp_probe"
    assert "limitation" in raw
    assert "open_ports" in parsed
