"""Wave 2 D–G: risk, policies, jira, projects, RBAC, graph, reports."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import timedelta

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
from app.models import Asset, Base, Finding, ScanJob, User, utcnow
from app.seed import run_seed
from app.services import module_queue as mq
from app.services import ops_jobs as ops_svc
from app.services.finding_risk import apply_risk_and_sla, reopen_expired_acceptances


@pytest.fixture()
def client_db():
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

    session = TestingSession()
    with TestClient(app) as c:
        yield c, session

    session.close()
    app.dependency_overrides.clear()
    get_settings.cache_clear()
    mq.clear_local_state()


def _login(client: TestClient) -> dict:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _seed_finding(db, *, asset: Asset | None = None, severity="HIGH", cves=None) -> Finding:
    job = ScanJob(module_id="nmap", status="success", params_json="{}", created_at=utcnow())
    db.add(job)
    db.flush()
    f = Finding(
        scan_job_id=job.id,
        module_id="nmap",
        asset_id=asset.id if asset else None,
        title="Test vuln",
        severity=severity,
        status="open",
        linked_cve_ids_json=json.dumps(cves or []),
        fingerprint=f"fp-{utcnow().timestamp()}",
        created_at=utcnow(),
    )
    db.add(f)
    db.flush()
    apply_risk_and_sla(db, f, asset=asset)
    db.commit()
    db.refresh(f)
    return f


def test_risk_score_and_accept_reopen(client_db):
    client, db = client_db
    h = _login(client)
    asset = Asset(hostname="crit.example", ip="10.0.0.1", criticality="critical", created_at=utcnow())
    db.add(asset)
    db.commit()
    f = _seed_finding(db, asset=asset, severity="CRITICAL")
    assert f.risk_score >= 70
    assert f.priority in ("high", "urgent")
    assert f.due_at is not None

    until = (utcnow() - timedelta(hours=1)).isoformat()
    r = client.patch(
        f"/findings/{f.id}",
        headers=h,
        json={
            "status": "accepted",
            "acceptance_reason": "compensating control",
            "accepted_until": until,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "accepted"
    assert body["acceptance_reason"] == "compensating control"
    assert body["risk_score"] >= 70

    db.expire_all()
    n = reopen_expired_acceptances(db)
    assert n >= 1
    f2 = db.get(Finding, f.id)
    assert f2 is not None
    assert f2.status == "open"

    n2 = ops_svc.process_ops_once(db)
    assert isinstance(n2, int)

    # backfill endpoint for upgraded DBs with risk_score=0
    stale = _seed_finding(db, severity="MEDIUM")
    stale.risk_score = 0
    db.commit()
    bf = client.post("/findings/recompute-risk?limit=50", headers=h)
    assert bf.status_code == 200, bf.text
    assert bf.json()["updated"] >= 1
    db.expire_all()
    assert (db.get(Finding, stale.id).risk_score or 0) > 0


def test_rules_v3_set_priority(client_db):
    client, db = client_db
    h = _login(client)
    rules = [
        {
            "when": {"severity_gte": "HIGH"},
            "action": "set_priority",
            "priority": "urgent",
            "enabled": True,
        },
        {
            "when": {"severity_gte": "HIGH"},
            "action": "add_tag",
            "tags": ["auto"],
            "enabled": True,
        },
    ]
    r = client.put("/settings/ticket-auto-rules", headers=h, json={"rules": rules})
    assert r.status_code == 200, r.text
    f = _seed_finding(db, severity="HIGH")
    from app.services import tickets as ticket_svc

    ticket_svc.evaluate_auto_rules_for_findings(db, [f])
    db.refresh(f)
    assert f.priority == "urgent"
    assert "auto" in json.loads(f.tags_json or "[]")


def test_jira_dry_run_and_policies(client_db):
    client, db = client_db
    h = _login(client)
    r = client.put(
        "/settings/jira",
        headers=h,
        json={"base_url": "https://jira.example", "project_key": "VBX", "dry_run": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["dry_run"] is True

    issue = client.post(
        "/integrations/jira/issues",
        headers=h,
        json={"summary": "Test issue", "description": "body"},
    )
    assert issue.status_code == 200, issue.text
    assert issue.json()["dry_run"] is True
    assert issue.json()["key"].startswith("DRY-")

    pol = client.post(
        "/alert-policies",
        headers=h,
        json={
            "name": "high risk",
            "trigger": "finding_created",
            "channels": ["webhook"],
            "filters": {"min_risk": 50},
            "enabled": True,
        },
    )
    assert pol.status_code == 200, pol.text
    policies = client.get("/alert-policies", headers=h)
    assert policies.status_code == 200
    assert len(policies.json()) >= 1


def test_projects_tags_reports_graph(client_db):
    client, db = client_db
    h = _login(client)
    proj = client.post("/projects", headers=h, json={"name": "Wave2", "description": "demo"})
    assert proj.status_code == 200, proj.text
    pid = proj.json()["id"]

    asset = Asset(hostname="g.example", ip="10.0.0.2", created_at=utcnow())
    db.add(asset)
    db.commit()
    f = _seed_finding(db, asset=asset, severity="HIGH", cves=["CVE-2024-0001"])
    tags = client.post("/findings/tags", headers=h, json={"finding_ids": [f.id], "tags": ["p1"]})
    assert tags.status_code == 200
    assert tags.json()["updated"] == 1

    graph = client.get(f"/graph/attack-path?asset_id={asset.id}", headers=h)
    assert graph.status_code == 200, graph.text
    data = graph.json()
    assert data["summary"]["nodes"] >= 2
    types = {n["type"] for n in data["nodes"]}
    assert "asset" in types
    assert "finding" in types

    tpl = client.post(
        "/report-templates",
        headers=h,
        json={
            "name": "Exec",
            "sections": [
                {"type": "title", "text": "Report"},
                {"type": "kpi"},
                {"type": "findings_table"},
            ],
        },
    )
    assert tpl.status_code == 200, tpl.text
    preview = client.post(
        "/reports/preview",
        headers=h,
        json={"template_id": tpl.json()["id"], "project_id": pid},
    )
    assert preview.status_code == 200
    assert "html" in preview.json()
    assert "Report" in preview.json()["html"]

    html = client.post("/reports/executive", headers=h, json={"format": "html"})
    assert html.status_code == 200
    assert b"html" in html.content.lower() or b"<!DOCTYPE" in html.content or b"<h1" in html.content


def test_org_rbac_walls(client_db):
    client, db = client_db
    h = _login(client)
    ua = client.post("/org-units", headers=h, json={"name": "BU-A"})
    ub = client.post("/org-units", headers=h, json={"name": "BU-B"})
    assert ua.status_code == 200 and ub.status_code == 200
    id_a, id_b = ua.json()["id"], ub.json()["id"]

    # create limited user
    from app.core.security import hash_password
    from app.models import Role

    role = db.query(Role).filter(Role.code == "analyst").first()
    assert role is not None
    user = User(
        username="analyst_a",
        email="a@example.local",
        full_name="Analyst A",
        password_hash=hash_password("AnalystPass123!"),
        status="active",
        is_super_admin=False,
        created_at=utcnow(),
    )
    user.roles.append(role)
    db.add(user)
    db.commit()
    db.refresh(user)
    client.put(f"/users/{user.id}/org-units", headers=h, json={"org_unit_ids": [id_a]})

    a1 = Asset(hostname="a-host", ip="10.1.0.1", org_unit_id=id_a, created_at=utcnow())
    a2 = Asset(hostname="b-host", ip="10.2.0.1", org_unit_id=id_b, created_at=utcnow())
    db.add_all([a1, a2])
    db.commit()
    f1 = _seed_finding(db, asset=a1)
    f2 = _seed_finding(db, asset=a2)

    login_a = client.post("/auth/login", json={"username": "analyst_a", "password": "AnalystPass123!"})
    assert login_a.status_code == 200, login_a.text
    ha = {"Authorization": f"Bearer {login_a.json()['access_token']}"}
    listed = client.get("/findings?page_size=100", headers=ha)
    assert listed.status_code == 200, listed.text
    ids = {r["id"] for r in listed.json()["results"]}
    assert f1.id in ids
    assert f2.id not in ids

    # IDOR: direct get of foreign BU asset/finding must 403
    forbid_a = client.get(f"/assets/{a2.id}", headers=ha)
    assert forbid_a.status_code == 403, forbid_a.text
    forbid_f = client.get(f"/findings/{f2.id}", headers=ha)
    assert forbid_f.status_code == 403, forbid_f.text
    ok_a = client.get(f"/assets/{a1.id}", headers=ha)
    assert ok_a.status_code == 200, ok_a.text
