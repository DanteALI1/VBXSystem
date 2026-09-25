"""Phase A/B/C ops foundation tests."""

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
from app.models import Base, Finding, ScanJob, ScanSchedule, User, utcnow
from app.seed import run_seed
from app.services import finding_lifecycle as life_svc
from app.services import module_queue as mq
from app.services import ops_jobs as ops_svc
from app.services import scan_diff as diff_svc
from app.services import scan_schedule as schedule_svc


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


def _admin(session) -> User:
    return session.query(User).filter(User.username == "admin").first()


def test_schedule_tick_enqueues_job(client_db):
    client, db = client_db
    user = _admin(db)
    now = utcnow()
    row = ScanSchedule(
        name="nmap quick",
        module_id="nmap",
        params_json=json.dumps({"target": "127.0.0.1", "ports": "80"}),
        interval_sec=3600,
        enabled=True,
        last_run_at=None,
        next_run_at=now - timedelta(seconds=5),
        created_by=user.id,
        created_at=now,
    )
    db.add(row)
    db.commit()

    n = schedule_svc.tick_due_schedules(db, limit=5)
    assert n >= 1
    job = (
        db.query(ScanJob)
        .filter(ScanJob.module_id == "nmap", ScanJob.kind == "scheduled")
        .order_by(ScanJob.id.desc())
        .first()
    )
    assert job is not None
    assert job.status in ("queued", "pending")


def test_job_diff_new_fixed(client_db):
    client, db = client_db
    user = _admin(db)
    j1 = ScanJob(
        module_id="nmap",
        status="success",
        kind="scan",
        created_by=user.id,
        params_json=json.dumps({"target": "10.0.0.1"}),
        progress_json="{}",
        created_at=utcnow(),
    )
    db.add(j1)
    db.commit()
    db.refresh(j1)
    for fp, title in (("fp-a", "A"), ("fp-b", "B")):
        db.add(
            Finding(
                scan_job_id=j1.id,
                module_id="nmap",
                title=title,
                severity="HIGH",
                status="open",
                fingerprint=fp,
                created_at=utcnow(),
            )
        )
    db.commit()

    j2 = ScanJob(
        module_id="nmap",
        status="success",
        kind="scan",
        created_by=user.id,
        params_json=json.dumps({"target": "10.0.0.1"}),
        progress_json="{}",
        created_at=utcnow(),
    )
    db.add(j2)
    db.commit()
    db.refresh(j2)
    for fp, title in (("fp-b", "B"), ("fp-c", "C")):
        db.add(
            Finding(
                scan_job_id=j2.id,
                module_id="nmap",
                title=title,
                severity="HIGH",
                status="open",
                fingerprint=fp,
                created_at=utcnow(),
            )
        )
    db.commit()

    diff = diff_svc.job_diff(db, j2.id)
    assert diff["previous_job_id"] == j1.id
    assert diff["summary"]["new"] == 1
    assert diff["summary"]["fixed"] == 1
    assert diff["summary"]["persistent"] == 1


def test_finding_lifecycle_status(client_db):
    client, db = client_db
    user = _admin(db)
    job = ScanJob(
        module_id="zap",
        status="success",
        kind="scan",
        created_by=user.id,
        params_json="{}",
        progress_json="{}",
        created_at=utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    f = Finding(
        scan_job_id=job.id,
        module_id="zap",
        title="XSS",
        severity="HIGH",
        status="open",
        fingerprint="xss-1",
        created_at=utcnow(),
    )
    db.add(f)
    db.commit()
    db.refresh(f)

    out = life_svc.update_finding(db, f.id, actor=user, status="false_positive", reason="noise")
    assert out["status"] == "false_positive"
    assert out["closed_at"]
    events = life_svc.list_events(db, f.id)
    assert any(e["event_type"] == "status" for e in events)


def test_ops_alert_outbox_email(client_db):
    client, db = client_db
    row = ops_svc.enqueue_alert(
        db,
        channel="email",
        payload={"to": "test@example.com", "text": "hello", "subject": "t"},
    )
    assert row.status == "pending"
    ops_svc.drain_alert_outbox(db, limit=1)
    db.refresh(row)
    assert row.status in ("sent", "pending", "failed")
    assert row.attempts >= 1 or row.status == "sent"


def test_schedule_api_crud(client_db):
    client, _db = client_db
    auth = _login(client)
    r = client.post(
        "/settings/scan-schedules",
        headers=auth,
        json={
            "module_id": "nmap",
            "name": "hourly",
            "params": {"target": "127.0.0.1"},
            "interval_sec": 7200,
            "enabled": False,
        },
    )
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    r2 = client.get("/settings/scan-schedules", headers=auth)
    assert r2.status_code == 200
    assert any(x["id"] == sid for x in r2.json())
    r3 = client.delete(f"/settings/scan-schedules/{sid}", headers=auth)
    assert r3.status_code == 200


def test_job_diff_api(client_db):
    client, db = client_db
    auth = _login(client)
    user = _admin(db)
    j = ScanJob(
        module_id="nmap",
        status="success",
        kind="scan",
        created_by=user.id,
        params_json=json.dumps({"target": "1.2.3.4"}),
        progress_json="{}",
        created_at=utcnow(),
    )
    db.add(j)
    db.commit()
    db.refresh(j)
    r = client.get(f"/modules/jobs/{j.id}/diff", headers=auth)
    assert r.status_code == 200
    assert r.json()["job_id"] == j.id


def test_finding_patch_api(client_db):
    client, db = client_db
    auth = _login(client)
    user = _admin(db)
    job = ScanJob(
        module_id="zap",
        status="success",
        kind="scan",
        created_by=user.id,
        params_json="{}",
        progress_json="{}",
        created_at=utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    f = Finding(
        scan_job_id=job.id,
        module_id="zap",
        title="XSS",
        severity="HIGH",
        status="open",
        fingerprint="xss-2",
        created_at=utcnow(),
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    r = client.patch(
        f"/findings/{f.id}",
        headers=auth,
        json={"status": "triaged", "reason": "looking"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "triaged"
