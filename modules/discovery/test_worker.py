"""Unit tests for discovery target parsing / mock findings (no network required)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

_SDK = Path(__file__).resolve().parents[1] / "_sdk" / "python"
sys.path.insert(0, str(_SDK))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from worker import (  # noqa: E402
    MOCK_HOSTS,
    allowlist_check_targets,
    discover_hosts,
    expand_targets,
    handle_job,
    host_to_finding,
    parse_ports,
    parse_targets,
    resolve_scan_options,
    targets_from_job,
)
from vbx_module_sdk import ModuleJob, target_allowed  # noqa: E402


def test_parse_targets_list_and_string():
    assert parse_targets(["10.0.0.1", " scan-target "]) == ["10.0.0.1", "scan-target"]
    assert parse_targets("10.0.0.1, 10.0.0.2\nscan-target") == [
        "10.0.0.1",
        "10.0.0.2",
        "scan-target",
    ]
    assert parse_targets(None) == []
    assert parse_targets("") == []


def test_parse_ports():
    assert parse_ports("22,80,443") == [22, 80, 443]
    assert parse_ports("8000-8002") == [8000, 8001, 8002]
    assert parse_ports(None) == [22, 80, 443, 8000, 3000]
    assert parse_ports([80, 443]) == [80, 443]


def test_expand_cidr_and_hosts():
    expanded = expand_targets(["10.0.0.0/30", "scan-target"], max_hosts=256)
    # /30 usable hosts: .1 and .2
    assert "10.0.0.1" in expanded
    assert "10.0.0.2" in expanded
    assert "scan-target" in expanded
    capped = expand_targets(["10.0.0.0/24"], max_hosts=5)
    assert len(capped) == 5


def test_resolve_scan_options():
    opts = resolve_scan_options(
        {"ports": "80,443", "connect_timeout": 0.5, "max_hosts": 64},
        {},
    )
    assert opts["ports"] == [80, 443]
    assert opts["connect_timeout"] == 0.5
    assert opts["max_hosts"] == 64


def test_mock_discover_hosts(monkeypatch):
    monkeypatch.setenv("VBX_DISCOVERY_MOCK", "true")
    hosts = discover_hosts(
        ["10.0.0.0/24"],
        ports=[80, 443],
        timeout=0.5,
        mock=True,
    )
    assert len(hosts) >= 1
    assert all(h.get("alive") for h in hosts)
    assert all(h.get("method") == "mock" for h in hosts)
    assert hosts[0]["ip"] == MOCK_HOSTS[0]["ip"]


def test_host_to_finding_shape():
    finding = host_to_finding(
        {
            "ip": "10.0.0.10",
            "hostname": "scan-target",
            "ports": [80, 443],
            "alive": True,
            "method": "mock",
        }
    )
    assert finding["schema"] == "finding.v1"
    assert finding["finding_type"] == "discovered_host"
    assert finding["severity"] == "info"
    assert finding["title"] == "Discovered host 10.0.0.10"
    assert finding["module_id"] == "discovery"
    assert finding["evidence"]["ip"] == "10.0.0.10"
    assert finding["evidence"]["hostname"] == "scan-target"
    assert finding["evidence"]["ports"] == [80, 443]
    assert finding["asset"]["ip"] == "10.0.0.10"
    assert finding["asset"]["hostname"] == "scan-target"


def test_allowlist_blocks_offlist():
    allow = {"10.0.0.0/8", "scan-target"}
    assert target_allowed("10.1.2.3", allow)
    assert allowlist_check_targets(["10.0.0.0/24"], allow) is None
    assert allowlist_check_targets(["8.8.8.8"], allow) is not None
    assert allowlist_check_targets([], allow) is not None


def test_targets_from_job():
    job = ModuleJob(
        id="1",
        module_id="discovery",
        target="",
        params={"targets": "10.0.0.1,scan-target"},
    )
    assert targets_from_job(job) == ["10.0.0.1", "scan-target"]

    job2 = ModuleJob(
        id="2",
        module_id="discovery",
        target="scan-target",
        params={},
    )
    assert targets_from_job(job2) == ["scan-target"]


def test_handle_job_mock_posts_auto_scan_hint(monkeypatch):
    monkeypatch.setenv("VBX_DISCOVERY_MOCK", "true")
    client = MagicMock()
    job = ModuleJob(
        id="99",
        module_id="discovery",
        target="",
        params={"targets": ["10.0.0.0/24"], "ports": "80,443"},
    )
    handle_job(client, job, {"10.0.0.0/8", "scan-target"})
    client.post_results.assert_called_once()
    kwargs = client.post_results.call_args.kwargs
    assert kwargs["status"] == "success"
    assert len(kwargs["findings"]) >= 1
    assert kwargs["findings"][0]["title"].startswith("Discovered host ")
    assert kwargs["raw"]["auto_scan_hint"] == {"module_id": "nmap", "reason": "discovery"}
    assert kwargs["raw"]["mock"] is True
