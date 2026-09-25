"""Scanner module register → job → claim → results → findings."""

import os
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["VBX_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["VBX_SECRET_KEY"] = "test-secret"
os.environ["VBX_REDIS_URL"] = "redis://localhost:6379/15"
os.environ["VBX_MODULE_TOKEN"] = "test-module-token"
os.environ["VBX_ADMIN_USERNAME"] = "admin"
os.environ["VBX_ADMIN_EMAIL"] = "admin@example.local"
os.environ["VBX_ADMIN_PASSWORD"] = "AdminPass123!"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base
from app.seed import run_seed
from app.services import module_queue as mq


@pytest.fixture()
def client():
    mq.clear_local_state()
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    seed_db = TestingSession()
    run_seed(seed_db)
    seed_db.close()

    def _override():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    @asynccontextmanager
    async def _noop_lifespan(_app):
        yield

    app = create_app()
    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[get_db] = _override

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    get_settings.cache_clear()
    mq.clear_local_state()


def _login(client: TestClient) -> str:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_module_job_lifecycle(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": ["port_scan"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["id"] == "nmap"

    r = client.get("/modules", headers=auth)
    assert r.status_code == 200, r.text
    mods = r.json()["modules"]
    assert any(m["id"] == "nmap" for m in mods)

    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1", "ports": "80,443"}},
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    assert r.json()["status"] in {"queued", "pending"}

    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-1"},
    )
    assert r.status_code == 200, r.text
    claimed = r.json()["job"]
    assert claimed is not None
    assert claimed["id"] == job_id
    assert claimed["status"] == "running"

    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={
            "lease_owner": "worker-1",
            "status": "success",
            "findings": [
                {
                    "title": "Open port 80/tcp",
                    "severity": "info",
                    "asset": {"ip": "127.0.0.1", "hostname": "localhost", "ports": [80]},
                    "evidence": {"port": 80},
                    "cve_ids": [],
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1
    assert r.json()["job"]["status"] == "success"

    r = client.get("/findings", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1
    finding_id = r.json()["results"][0]["id"]

    r = client.get("/findings?q=localhost", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1

    r = client.get("/findings/export?q=Open", headers=auth)
    assert r.status_code == 200, r.text
    assert "title" in r.text
    assert "Open port" in r.text

    r = client.get("/assets", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1

    r = client.get("/assets/export?q=localhost", headers=auth)
    assert r.status_code == 200, r.text
    assert "hostname" in r.text
    assert "localhost" in r.text or "127.0.0.1" in r.text

    r = client.get("/modules/jobs/export?module_id=nmap", headers=auth)
    assert r.status_code == 200, r.text
    assert "module_id" in r.text
    assert "nmap" in r.text

    r = client.get("/modules/jobs?status=success", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1

    r = client.post(f"/findings/{finding_id}/ticket", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["ticket"]["id"] > 0

    ticket_id = r.json()["ticket"]["id"]
    r = client.get("/tickets/export", headers=auth)
    assert r.status_code == 200, r.text
    assert "title" in r.text
    assert str(ticket_id) in r.text


def test_module_settings_admin(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    r = client.get("/settings/modules", headers=auth)
    assert r.status_code == 200, r.text
    assert "allowlist" in r.json()
    assert "nmap_default_profile" in r.json()
    assert "shodan_modes_enabled" in r.json()
    assert "zap_default_scan_type" in r.json()

    r = client.put(
        "/settings/modules",
        headers=auth,
        json={
            "disabled_modules": ["nmap"],
            "allowlist": "127.0.0.1,scan-target",
            "shodan_mock": True,
            "shodan_modes_enabled": ["host", "dns"],
            "shodan_rate_limit_hint": 2,
            "nmap_default_ports": "80,443",
            "nmap_default_profile": "quick",
            "nmap_default_timing": 4,
            "nmap_default_sv": True,
            "nmap_default_os": False,
            "nmap_default_aggressive": False,
            "nmap_default_scripts": "safe",
            "nmap_default_top_ports": "50",
            "nmap_default_exclude": "",
            "zap_timeout_sec": 120,
            "zap_default_scan_type": "spider",
            "zap_default_ajax_spider": True,
            "zap_default_context_name": "demo",
            "zap_default_context_user": "user1",
            "nuclei_default_templates": "/root/nuclei-templates",
            "nuclei_rate_limit": 80,
            "gowitness_timeout_sec": 45,
            "gowitness_default_resolution": "1280x720",
            "gowitness_default_fullpage": True,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "nmap" in body["disabled_modules"]
    assert "scan-target" in body["allowlist"]
    assert body["nmap_default_profile"] == "quick"
    assert body["nmap_default_timing"] == 4
    assert body["nmap_default_sv"] is True
    assert body["shodan_modes_enabled"] == ["host", "dns"]
    assert body["shodan_rate_limit_hint"] == 2
    assert body["zap_default_scan_type"] == "spider"
    assert body["zap_default_ajax_spider"] is True
    assert body["zap_default_context_name"] == "demo"
    assert body["nuclei_default_templates"] == "/root/nuclei-templates"
    assert body["nuclei_rate_limit"] == 80
    assert body["gowitness_timeout_sec"] == 45
    assert body["gowitness_default_resolution"] == "1280x720"
    assert body["gowitness_default_fullpage"] is True

    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": ["port_scan"]},
    )
    assert r.status_code == 200, r.text

    r = client.get("/modules", headers=auth)
    assert r.status_code == 200, r.text
    nmap = next(m for m in r.json()["modules"] if m["id"] == "nmap")
    assert nmap["enabled"] is False

    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1"}},
    )
    assert r.status_code == 400, r.text

    r = client.get("/internal/modules/config", headers=mod)
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert "127.0.0.1" in cfg["allowlist"]
    assert cfg["zap_timeout_sec"] == 120
    assert cfg["nmap_default_profile"] == "quick"
    assert cfg["nmap_default_sv"] is True
    assert cfg["shodan_modes_enabled"] == ["host", "dns"]
    assert cfg["zap_default_scan_type"] == "spider"
    assert cfg["zap_default_context_user"] == "user1"
    assert cfg["nuclei_default_templates"] == "/root/nuclei-templates"
    assert cfg["nuclei_rate_limit"] == 80
    assert cfg["gowitness_timeout_sec"] == 45
    assert cfg["gowitness_default_resolution"] == "1280x720"
    assert cfg["gowitness_default_fullpage"] is True

    # allowlist blocks off-list targets once configured
    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"disabled_modules": [], "allowlist": "127.0.0.1,scan-target"},
    )
    assert r.status_code == 200, r.text

    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "evil.example"}},
    )
    assert r.status_code == 400, r.text

    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1"}},
    )
    assert r.status_code == 200, r.text

    # re-enable (already empty) — clear allowlist for isolation
    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"disabled_modules": [], "allowlist": ""},
    )
    assert r.status_code == 200, r.text


def test_enqueue_with_extended_params(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.2.0", "capabilities": ["port_scan"]},
    )
    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={
            "params": {
                "target": "127.0.0.1",
                "profile": "default",
                "ports": "80,443",
                "timing": 3,
                "service_detection": True,
            }
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["params"]["profile"] == "default"
    assert r.json()["params"]["service_detection"] is True

    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "shodan", "version": "0.2.0", "capabilities": ["enrichment.shodan"]},
    )
    r = client.post(
        "/modules/shodan/jobs",
        headers=auth,
        json={"params": {"mode": "search", "query": "port:443", "target": "8.8.8.8"}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["params"]["mode"] == "search"

    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "zap", "version": "0.2.0", "capabilities": ["web.baseline"]},
    )
    r = client.post(
        "/modules/zap/jobs",
        headers=auth,
        json={
            "params": {
                "target": "http://scan-target",
                "scan_type": "full",
                "ajax_spider": True,
                "max_duration": 180,
            }
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["params"]["scan_type"] == "full"


def test_results_reject_wrong_lease_and_normalize_severity(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": []},
    )
    job_id = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1"}},
    ).json()["id"]
    client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-a"},
    )

    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={"lease_owner": "worker-b", "status": "success", "findings": []},
    )
    assert r.status_code == 403, r.text

    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={
            "lease_owner": "worker-a",
            "status": "success",
            "findings": [
                {
                    "title": "ZAP noise",
                    "severity": "informational",
                    "target": "127.0.0.1",
                    "evidence": {},
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["findings"][0]["severity"] == "INFO"

    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={"lease_owner": "worker-a", "status": "success", "findings": []},
    )
    assert r.status_code == 400, r.text


def test_asset_crud_and_promote(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    # Create
    r = client.post(
        "/assets",
        headers=auth,
        json={
            "hostname": "Web.Example.Local",
            "ip": "10.10.0.5",
            "kind": "host",
            "ports": [80],
            "tags": ["prod"],
        },
    )
    assert r.status_code == 200, r.text
    asset = r.json()
    assert asset["hostname"] == "web.example.local"
    assert asset["ip"] == "10.10.0.5"
    assert 80 in asset["ports"]
    asset_id = asset["id"]

    # Duplicate create rejected (case-insensitive)
    r = client.post(
        "/assets",
        headers=auth,
        json={"hostname": "WEB.EXAMPLE.LOCAL", "ip": "10.10.0.5"},
    )
    assert r.status_code == 400, r.text

    # Update
    r = client.patch(
        f"/assets/{asset_id}",
        headers=auth,
        json={"ports": [80, 443], "tags": ["prod", "dmz"], "kind": "service"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "service"
    assert set(r.json()["ports"]) >= {80, 443}
    assert "dmz" in r.json()["tags"]

    # Finding without auto-asset — promote merges into existing
    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": ["port_scan"]},
    )
    assert r.status_code == 200, r.text

    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "10.10.0.5"}},
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]

    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-promote"},
    )
    assert r.status_code == 200, r.text

    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={
            "lease_owner": "worker-promote",
            "status": "success",
            "findings": [
                {
                    "title": "TLS on 443",
                    "severity": "info",
                    "asset": {},
                    "evidence": {
                        "ip": "10.10.0.5",
                        "hostname": "WEB.EXAMPLE.LOCAL",
                        "ports": [443, 8443],
                        "tags": ["tls"],
                    },
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    finding_id = r.json()["findings"][0]["id"]
    assert not r.json()["findings"][0].get("asset_id")

    r = client.post(f"/findings/{finding_id}/promote-asset", headers=auth)
    assert r.status_code == 200, r.text
    promo = r.json()
    assert promo["merged"] is True
    assert promo["created"] is False
    assert promo["asset"]["id"] == asset_id
    assert promo["finding"]["asset_id"] == asset_id
    assert 8443 in promo["asset"]["ports"]
    assert "tls" in [str(t).lower() for t in promo["asset"]["tags"]]
    assert promo["message"]

    # Promote again — already linked
    r = client.post(f"/findings/{finding_id}/promote-asset", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["asset"]["id"] == asset_id

    # New identity via promote creates asset
    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "10.20.0.8"}},
    )
    assert r.status_code == 200, r.text
    job2 = r.json()["id"]
    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-promote-2"},
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/internal/modules/jobs/{job2}/results",
        headers=mod,
        json={
            "lease_owner": "worker-promote-2",
            "status": "success",
            "findings": [
                {
                    "title": "Open 22",
                    "severity": "low",
                    "asset": {},
                    "evidence": {"ip": "10.20.0.8", "hostname": "ssh-box", "ports": [22]},
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    fid2 = r.json()["findings"][0]["id"]
    r = client.post(f"/findings/{fid2}/promote-asset", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["created"] is True
    new_id = r.json()["asset"]["id"]
    assert new_id != asset_id

    # Delete unlinks findings, does not destroy them
    r = client.get(f"/findings?asset_id={asset_id}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1

    r = client.delete(f"/assets/{asset_id}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] is True
    assert r.json()["unlinked_findings"] >= 1

    r = client.get(f"/assets/{asset_id}", headers=auth)
    assert r.status_code == 404, r.text

    r = client.get("/findings?q=TLS", headers=auth)
    assert r.status_code == 200, r.text
    match = next(x for x in r.json()["results"] if x["id"] == finding_id)
    assert match["asset_id"] is None
    assert match["title"]


def test_cancel_queued_and_running_job(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": []},
    )

    # Cancel while queued
    job_id = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1"}},
    ).json()["id"]
    r = client.post(f"/modules/jobs/{job_id}/cancel", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"
    assert r.json()["finished_at"]

    # Claim must not return cancelled job
    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-cancel"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["job"] is None

    # Cancel while running → aborted; heartbeat/results ignored
    job2 = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1"}},
    ).json()["id"]
    client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-run"},
    )
    r = client.post(f"/modules/jobs/{job2}/cancel", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "aborted"

    r = client.post(
        f"/internal/modules/jobs/{job2}/heartbeat",
        headers=mod,
        json={"lease_owner": "worker-run", "progress": {"pct": 50}},
    )
    assert r.status_code == 400, r.text

    r = client.post(
        f"/internal/modules/jobs/{job2}/results",
        headers=mod,
        json={
            "lease_owner": "worker-run",
            "status": "success",
            "findings": [{"title": "should-ignore", "severity": "info", "target": "127.0.0.1"}],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ignored") is True
    assert body["created"] == 0
    assert body["job"]["status"] == "aborted"

    # Double cancel rejected
    r = client.post(f"/modules/jobs/{job2}/cancel", headers=auth)
    assert r.status_code == 400, r.text


def test_scan_stats_and_metrics(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": []},
    )

    # Allowlist denial increments enqueue counter
    client.put(
        "/settings/modules",
        headers=auth,
        json={"allowlist": "127.0.0.1"},
    )
    r = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "evil.example"}},
    )
    assert r.status_code == 400, r.text

    job_id = client.post(
        "/modules/nmap/jobs",
        headers=auth,
        json={"params": {"target": "127.0.0.1"}},
    ).json()["id"]
    client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-stats"},
    )
    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={
            "lease_owner": "worker-stats",
            "status": "success",
            "findings": [
                {
                    "title": "ok",
                    "severity": "info",
                    "asset": {"ip": "127.0.0.1"},
                    "evidence": {},
                },
                {
                    "title": "offlist",
                    "severity": "info",
                    "asset": {"ip": "8.8.8.8"},
                    "evidence": {},
                },
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1
    assert r.json().get("skipped_offlist", 0) >= 1

    r = client.get("/modules/stats", headers=auth)
    assert r.status_code == 200, r.text
    stats = r.json()
    assert "running_jobs" in stats
    assert "stale_leases_reclaimed" in stats
    assert stats["findings_created"] >= 1
    assert stats["allowlist_denials_enqueue"] >= 1
    assert stats["allowlist_denials_ingest"] >= 1
    assert stats["claim_wait_avg_ms"] is not None or stats["claim_wait_last_ms"] >= 0
    assert stats["lease_ttl_sec"] >= 60

    r = client.get("/metrics")
    assert r.status_code == 200, r.text
    assert "scan" in r.json()
    assert r.json()["scan"]["findings_created"] >= 1

    # cleanup allowlist
    client.put("/settings/modules", headers=auth, json={"allowlist": ""})

def test_scan_credential_vault_crud(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    r = client.get("/settings/scan-credentials", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["credentials"] == []

    r = client.post(
        "/settings/scan-credentials",
        headers=auth,
        json={
            "name": "App login",
            "kind": "http_form",
            "username": "scanner",
            "password": "s3cret-pass",
            "extra": {
                "login_url": "https://app.example/login",
                "username_field": "email",
                "password_field": "pass",
            },
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] >= 1
    assert body["name"] == "App login"
    assert body["kind"] == "http_form"
    assert body["username"] == "scanner"
    assert body["password_set"] is True
    assert body["password_masked"] == "********"
    assert "password" not in body
    assert body["extra"]["login_url"] == "https://app.example/login"
    assert "s3cret" not in r.text
    cred_id = body["id"]

    r = client.get("/settings/scan-credentials", headers=auth)
    assert r.status_code == 200, r.text
    assert len(r.json()["credentials"]) == 1
    assert "password" not in r.json()["credentials"][0]
    assert r.json()["credentials"][0]["password_masked"] == "********"

    r = client.patch(
        f"/settings/scan-credentials/{cred_id}",
        headers=auth,
        json={"username": "scanner2", "extra": {"login_url": "https://app.example/signin"}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "scanner2"
    assert r.json()["extra"]["login_url"] == "https://app.example/signin"
    assert r.json()["password_set"] is True
    assert "password" not in r.json()

    r = client.get(f"/internal/modules/credentials/{cred_id}", headers=mod)
    assert r.status_code == 200, r.text
    internal = r.json()
    assert internal["password"] == "s3cret-pass"
    assert internal["username"] == "scanner2"
    assert internal["extra"]["login_url"] == "https://app.example/signin"

    r = client.get(f"/internal/modules/credentials/{cred_id}")
    assert r.status_code == 401

    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"zap_default_credential_id": cred_id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["zap_default_credential_id"] == cred_id

    r = client.get("/internal/modules/config", headers=mod)
    assert r.status_code == 200, r.text
    assert r.json()["zap_default_credential_id"] == cred_id

    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"clear_zap_default_credential": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["zap_default_credential_id"] is None

    r = client.delete(f"/settings/scan-credentials/{cred_id}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] is True

    r = client.get("/settings/scan-credentials", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["credentials"] == []

    r = client.get(f"/internal/modules/credentials/{cred_id}", headers=mod)
    assert r.status_code == 404

    r = client.post(
        "/settings/scan-credentials",
        headers=auth,
        json={"name": "bad", "kind": "not-a-kind", "password": "x"},
    )
    assert r.status_code == 400, r.text

def _enqueue_and_claim(client: TestClient, auth: dict, mod: dict, module_id: str = "nmap", lease: str = "worker-dedupe"):
    client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": module_id, "version": "0.9.0", "capabilities": ["port_scan"]},
    )
    r = client.post(
        f"/modules/{module_id}/jobs",
        headers=auth,
        json={"params": {"target": "10.0.0.5"}},
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": module_id, "lease_owner": lease},
    )
    assert r.status_code == 200, r.text
    assert r.json()["job"]["id"] == job_id
    return job_id


def test_finding_fingerprint_dedupe_across_rescans(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    finding_payload = {
        "title": "OpenSSH outdated",
        "severity": "MEDIUM",
        "asset": {"ip": "10.0.0.5", "hostname": "srv-a"},
        "evidence": {"port": 22, "plugin_id": "openssh-check"},
        "cve_ids": ["CVE-2023-38408"],
    }

    job1 = _enqueue_and_claim(client, auth, mod, lease="worker-fp-1")
    r = client.post(
        f"/internal/modules/jobs/{job1}/results",
        headers=mod,
        json={"lease_owner": "worker-fp-1", "status": "success", "findings": [finding_payload]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1
    assert r.json()["updated"] == 0
    f1 = r.json()["findings"][0]
    assert f1["fingerprint"]
    assert f1["occurrence_count"] == 1
    fid = f1["id"]
    fp = f1["fingerprint"]

    job2 = _enqueue_and_claim(client, auth, mod, lease="worker-fp-2")
    r = client.post(
        f"/internal/modules/jobs/{job2}/results",
        headers=mod,
        json={
            "lease_owner": "worker-fp-2",
            "status": "success",
            "findings": [
                {
                    **finding_payload,
                    "severity": "HIGH",
                    "evidence": {"port": 22, "plugin_id": "openssh-check", "banner": "OpenSSH_8.2"},
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 0
    assert r.json()["updated"] == 1
    f2 = r.json()["findings"][0]
    assert f2["id"] == fid
    assert f2["fingerprint"] == fp
    assert f2["occurrence_count"] == 2
    assert f2["severity"] == "HIGH"
    assert f2["evidence"].get("banner") == "OpenSSH_8.2"

    listed = client.get("/findings?q=OpenSSH", headers=auth)
    assert listed.status_code == 200
    matches = [x for x in listed.json()["results"] if x["fingerprint"] == fp]
    assert len(matches) == 1


def test_ticket_auto_rules_settings_and_ingest(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    r = client.get("/settings/ticket-auto-rules", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["rules"] == []

    r = client.put(
        "/settings/ticket-auto-rules",
        headers=auth,
        json={
            "rules": [
                {"when": {"severity_gte": "HIGH"}, "action": "create_ticket", "enabled": True},
                {"when": "is_kev", "action": "create_ticket", "enabled": True},
                {"when": {"cve_match": "CVE-2021-44228"}, "action": "create_ticket"},
            ]
        },
    )
    assert r.status_code == 200, r.text
    rules = r.json()["rules"]
    assert len(rules) == 3
    assert rules[0]["when"]["severity_gte"] == "HIGH"
    assert rules[1]["when"]["is_kev"] is True
    assert rules[2]["when"]["cve_match"] == "CVE-2021-44228"

    # low severity — no ticket
    job_low = _enqueue_and_claim(client, auth, mod, lease="worker-ar-low")
    r = client.post(
        f"/internal/modules/jobs/{job_low}/results",
        headers=mod,
        json={
            "lease_owner": "worker-ar-low",
            "status": "success",
            "findings": [
                {
                    "title": "Info banner",
                    "severity": "LOW",
                    "asset": {"ip": "10.0.0.8"},
                    "evidence": {"port": 80},
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["tickets_created"] == 0
    assert r.json()["findings"][0]["ticket_id"] is None

    # HIGH — auto ticket
    job_hi = _enqueue_and_claim(client, auth, mod, lease="worker-ar-hi")
    r = client.post(
        f"/internal/modules/jobs/{job_hi}/results",
        headers=mod,
        json={
            "lease_owner": "worker-ar-hi",
            "status": "success",
            "findings": [
                {
                    "title": "RCE possible",
                    "severity": "CRITICAL",
                    "asset": {"ip": "10.0.0.9", "hostname": "web"},
                    "evidence": {"port": 443, "plugin_id": "rce-1"},
                    "cve_ids": ["CVE-2099-0001"],
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1
    assert r.json()["tickets_created"] == 1
    finding = r.json()["findings"][0]
    assert finding["ticket_id"] is not None
    tid = finding["ticket_id"]
    fid = finding["id"]

    # rescan same fingerprint — no second ticket
    job_hi2 = _enqueue_and_claim(client, auth, mod, lease="worker-ar-hi2")
    r = client.post(
        f"/internal/modules/jobs/{job_hi2}/results",
        headers=mod,
        json={
            "lease_owner": "worker-ar-hi2",
            "status": "success",
            "findings": [
                {
                    "title": "RCE possible",
                    "severity": "CRITICAL",
                    "asset": {"ip": "10.0.0.9", "hostname": "web"},
                    "evidence": {"port": 443, "plugin_id": "rce-1"},
                    "cve_ids": ["CVE-2099-0001"],
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["updated"] == 1
    assert r.json()["tickets_created"] == 0
    assert r.json()["findings"][0]["id"] == fid
    assert r.json()["findings"][0]["ticket_id"] == tid

    # explicit CVE match
    job_cve = _enqueue_and_claim(client, auth, mod, lease="worker-ar-cve")
    r = client.post(
        f"/internal/modules/jobs/{job_cve}/results",
        headers=mod,
        json={
            "lease_owner": "worker-ar-cve",
            "status": "success",
            "findings": [
                {
                    "title": "Log4Shell remnant",
                    "severity": "MEDIUM",
                    "asset": {"ip": "10.0.0.10"},
                    "evidence": {"port": 8080},
                    "cve_ids": ["CVE-2021-44228"],
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["tickets_created"] == 1
    assert r.json()["findings"][0]["ticket_id"] is not None

def test_asset_inventory_enhance_merge_owner_segment(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    # Tags taxonomy
    r = client.get("/assets/tags", headers=auth)
    assert r.status_code == 200, r.text
    tags = r.json()["tags"]
    assert isinstance(tags, list) and len(tags) >= 1
    assert "prod" in [str(t).lower() for t in tags]

    # Owners list
    r = client.get("/assets/owners", headers=auth)
    assert r.status_code == 200, r.text
    owners = r.json()["owners"]
    assert any(o["username"] == "admin" for o in owners)
    admin_id = next(o["id"] for o in owners if o["username"] == "admin")

    # Create with segment + owner
    r = client.post(
        "/assets",
        headers=auth,
        json={
            "hostname": "app-a.local",
            "ip": "10.50.0.1",
            "ports": [80],
            "tags": ["prod"],
            "segment": "corp-lan",
            "owner_user_id": admin_id,
        },
    )
    assert r.status_code == 200, r.text
    a1 = r.json()
    assert a1["segment"] == "corp-lan"
    assert a1["owner_user_id"] == admin_id
    assert a1["owner_username"] == "admin"
    id1 = a1["id"]

    # Unique IP rejected at app layer
    r = client.post(
        "/assets",
        headers=auth,
        json={"hostname": "other.local", "ip": "10.50.0.1"},
    )
    assert r.status_code == 400, r.text

    # Unique hostname rejected
    r = client.post(
        "/assets",
        headers=auth,
        json={"hostname": "APP-A.LOCAL", "ip": "10.50.0.99"},
    )
    assert r.status_code == 400, r.text

    # Empty IP allowed on multiple rows (partial unique)
    r = client.post(
        "/assets",
        headers=auth,
        json={"hostname": "host-only-1", "ip": ""},
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/assets",
        headers=auth,
        json={"hostname": "host-only-2", "ip": ""},
    )
    assert r.status_code == 200, r.text

    # Second asset for merge
    r = client.post(
        "/assets",
        headers=auth,
        json={
            "hostname": "app-b.local",
            "ip": "10.50.0.2",
            "ports": [443],
            "tags": ["dmz"],
            "segment": "dmz",
        },
    )
    assert r.status_code == 200, r.text
    id2 = r.json()["id"]

    # Filter by segment / owner
    r = client.get("/assets?segment=corp-lan", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1
    assert all(x["segment"].lower() == "corp-lan" for x in r.json()["results"])

    r = client.get(f"/assets?owner_user_id={admin_id}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1
    assert all(x["owner_user_id"] == admin_id for x in r.json()["results"])

    # Attach finding to source (id2) then merge into id1
    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": ["port_scan"]},
    )
    assert r.status_code == 200, r.text
    r = client.post("/modules/nmap/jobs", headers=auth, json={"params": {"target": "10.50.0.2"}})
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "nmap", "lease_owner": "worker-merge"},
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={
            "lease_owner": "worker-merge",
            "status": "success",
            "findings": [
                {
                    "title": "Open 443",
                    "severity": "low",
                    "asset": {"ip": "10.50.0.2", "hostname": "app-b.local"},
                    "evidence": {"ip": "10.50.0.2", "ports": [443]},
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    fid = r.json()["findings"][0]["id"]
    # Link finding to source asset explicitly via promote or patch — promote by identity
    r = client.post(f"/findings/{fid}/promote-asset", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["asset"]["id"] == id2

    r = client.post(
        f"/assets/{id2}/merge",
        headers=auth,
        json={"into_asset_id": id1},
    )
    assert r.status_code == 200, r.text
    merged = r.json()
    assert merged["source_asset_id"] == id2
    assert merged["target"]["id"] == id1
    assert merged["moved_findings"] >= 1
    assert 443 in merged["target"]["ports"]
    assert "dmz" in [str(t).lower() for t in merged["target"]["tags"]]
    assert merged["target"]["segment"] == "corp-lan"  # target keeps its segment

    r = client.get(f"/assets/{id2}", headers=auth)
    assert r.status_code == 404, r.text

    r = client.get(f"/findings?asset_id={id1}", headers=auth)
    assert r.status_code == 200, r.text
    assert any(x["id"] == fid for x in r.json()["results"])

    # Patch segment/owner
    r = client.patch(
        f"/assets/{id1}",
        headers=auth,
        json={"segment": "mgmt", "owner_user_id": None},
    )
    assert r.status_code == 200, r.text
    assert r.json()["segment"] == "mgmt"
    assert r.json()["owner_user_id"] is None

    # Self-merge rejected
    r = client.post(f"/assets/{id1}/merge", headers=auth, json={"into_asset_id": id1})
    assert r.status_code == 400, r.text

def test_worker_config_hides_shodan_key(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token", "X-Module-Id": "shodan"}

    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"shodan_api_key": "sk-test-shodan-secret-key", "shodan_mock": False},
    )
    assert r.status_code == 200, r.text
    assert r.json()["shodan_api_key_set"] is True

    r = client.get("/internal/modules/config", headers=mod)
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert "shodan_api_key" not in cfg or cfg.get("shodan_api_key") in (None, "")
    assert cfg["shodan_api_key_set"] is True

    r = client.post("/internal/modules/shodan/api-key", headers=mod, json={})
    assert r.status_code == 200, r.text
    assert r.json()["shodan_api_key"] == "sk-test-shodan-secret-key"
    assert r.json()["shodan_api_key_set"] is True

    # nmap token cannot fetch shodan key even with shared... wait, shared can.
    # Per-module nmap token must be rejected when X-Module-Id is nmap
    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"module_tokens": {"nmap": "nmap-only-token-xyz"}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["module_tokens_set"].get("nmap") is True

    bad = {"X-Module-Token": "nmap-only-token-xyz", "X-Module-Id": "nmap"}
    r = client.post("/internal/modules/shodan/api-key", headers=bad, json={})
    assert r.status_code in (401, 403), r.text


def test_per_module_token_auth(client: TestClient):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}

    r = client.put(
        "/settings/modules",
        headers=auth,
        json={"module_tokens": {"nmap": "per-nmap-secret-token"}},
    )
    assert r.status_code == 200, r.text

    # Wrong shared-style token fails
    r = client.post(
        "/internal/modules/register",
        headers={"X-Module-Token": "wrong", "X-Module-Id": "nmap"},
        json={"id": "nmap", "version": "0.1.0", "capabilities": []},
    )
    assert r.status_code == 401, r.text

    # Per-module token works for nmap
    mod = {"X-Module-Token": "per-nmap-secret-token", "X-Module-Id": "nmap"}
    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "nmap", "version": "0.1.0", "capabilities": ["port_scan"]},
    )
    assert r.status_code == 200, r.text

    # Per-module nmap token cannot register as shodan
    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "shodan", "version": "0.1.0", "capabilities": []},
    )
    assert r.status_code == 403, r.text

    # Shared token still works
    shared = {"X-Module-Token": "test-module-token", "X-Module-Id": "shodan"}
    r = client.post(
        "/internal/modules/register",
        headers=shared,
        json={"id": "shodan", "version": "0.1.0", "capabilities": []},
    )
    assert r.status_code == 200, r.text


def test_secrets_backend_env_prefix(monkeypatch):
    from app.services.secrets import EnvSecretBackend, get_secret_backend

    get_secret_backend.cache_clear()
    monkeypatch.setenv("VBX_SECRET__DEMO_KEY", "from-prefix")
    monkeypatch.delenv("DEMO_KEY", raising=False)
    be = EnvSecretBackend()
    assert be.get("DEMO_KEY") == "from-prefix"
    get_secret_backend.cache_clear()
