"""Ticket workflow and permission tests."""

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
os.environ["VBX_ADMIN_USERNAME"] = "admin"
os.environ["VBX_ADMIN_EMAIL"] = "admin@example.local"
os.environ["VBX_ADMIN_PASSWORD"] = "AdminPass123!"

from app.core.config import get_settings

get_settings.cache_clear()

from app.core.security import hash_password
from app.db import get_db
from app.main import create_app
from app.models import Base, Group, Role, User, user_roles
from app.seed import run_seed


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    seed_db = TestingSession()
    run_seed(seed_db)
    # analyst user
    analyst_role = seed_db.query(Role).filter_by(code="analyst").one()
    viewer_role = seed_db.query(Role).filter_by(code="viewer").one()
    g = Group(name="Queue SOC", source="local", description="test queue")
    seed_db.add(g)
    seed_db.flush()
    analyst = User(
        username="analyst1",
        email="analyst1@example.local",
        password_hash=hash_password("AnalystPass1!"),
        full_name="Analyst",
        status="active",
    )
    viewer = User(
        username="viewer1",
        email="viewer1@example.local",
        password_hash=hash_password("ViewerPass1!"),
        full_name="Viewer",
        status="active",
    )
    seed_db.add_all([analyst, viewer])
    seed_db.flush()
    seed_db.execute(user_roles.insert().values(user_id=analyst.id, role_id=analyst_role.id))
    seed_db.execute(user_roles.insert().values(user_id=viewer.id, role_id=viewer_role.id))
    seed_db.commit()
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


def _login(client: TestClient, username: str, password: str) -> str:
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_create_from_cve_and_transitions(client):
    tok = _login(client, "analyst1", "AnalystPass1!")
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post(
        "/tickets",
        headers=h,
        json={"title": "Fix CVE-2024-0001", "linked_cve_id": "CVE-2024-0001", "severity": "CRITICAL"},
    )
    assert r.status_code == 200
    tid = r.json()["ticket"]["id"]
    assert r.json()["ticket"]["status"] == "new"

    # duplicate warning
    r2 = client.post(
        "/tickets",
        headers=h,
        json={"title": "Again", "linked_cve_id": "CVE-2024-0001", "severity": "HIGH"},
    )
    assert r2.status_code == 200
    assert r2.json()["warning"]

    st = client.post(f"/tickets/{tid}/status", headers=h, json={"status": "in_progress"})
    assert st.status_code == 200
    assert st.json()["status"] == "in_progress"

    bad = client.post(f"/tickets/{tid}/status", headers=h, json={"status": "new"})
    assert bad.status_code == 400

    client.post(f"/tickets/{tid}/status", headers=h, json={"status": "resolved"})
    closed = client.post(f"/tickets/{tid}/status", headers=h, json={"status": "closed"})
    assert closed.status_code == 200


def test_viewer_cannot_create(client):
    tok = _login(client, "viewer1", "ViewerPass1!")
    r = client.post(
        "/tickets",
        headers={"Authorization": f"Bearer {tok}"},
        json={"title": "Nope", "severity": "LOW"},
    )
    assert r.status_code == 403


def test_assign_requires_manage(client):
    analyst = _login(client, "analyst1", "AnalystPass1!")
    admin = _login(client, "admin", "AdminPass123!")
    created = client.post(
        "/tickets",
        headers={"Authorization": f"Bearer {analyst}"},
        json={"title": "Assign me", "severity": "MEDIUM"},
    )
    tid = created.json()["ticket"]["id"]
    groups = client.get("/tickets/meta/groups", headers={"Authorization": f"Bearer {admin}"})
    assert groups.status_code == 200
    gid = groups.json()[0]["id"]

    denied = client.post(
        f"/tickets/{tid}/assign",
        headers={"Authorization": f"Bearer {analyst}"},
        json={"group_id": gid},
    )
    assert denied.status_code == 403

    ok = client.post(
        f"/tickets/{tid}/assign",
        headers={"Authorization": f"Bearer {admin}"},
        json={"group_id": gid, "assignee_user_id": 1},
    )
    assert ok.status_code == 200
    assert ok.json()["group_id"] == gid


def test_comment_and_detail(client):
    tok = _login(client, "admin", "AdminPass123!")
    h = {"Authorization": f"Bearer {tok}"}
    tid = client.post("/tickets", headers=h, json={"title": "C", "severity": "LOW"}).json()["ticket"]["id"]
    c = client.post(f"/tickets/{tid}/comments", headers=h, json={"body": "hello"})
    assert c.status_code == 200
    detail = client.get(f"/tickets/{tid}", headers=h)
    assert detail.status_code == 200
    assert len(detail.json()["comments"]) == 1
    assert any(e["event_type"] == "comment" for e in detail.json()["events"])
