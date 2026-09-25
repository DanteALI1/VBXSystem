"""W10/W11 + raw_json + search column views."""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

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
os.environ["VBX_ADMIN_ORG"] = ""  # allow setup wizard tests
os.environ.pop("VBX_CVE_STORE_RAW_JSON", None)
os.environ["VBX_PROFILE"] = "dev"

from app.core.config import get_settings

get_settings.cache_clear()

from app.core.security import hash_password
from app.db import get_db
from app.main import create_app
from app.models import Base, Role, User, user_roles
from app.seed import run_seed
from app.services.auth_helpers import set_setting


@pytest.fixture()
def client():
    get_settings.cache_clear()
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    seed_db = TestingSession()
    run_seed(seed_db)
    set_setting(seed_db, "setup_completed", "false")
    analyst_role = seed_db.query(Role).filter_by(code="analyst").one()
    analyst = User(
        username="analyst1",
        email="analyst1@example.local",
        password_hash=hash_password("AnalystPass1!"),
        full_name="Analyst",
        status="active",
    )
    seed_db.add(analyst)
    seed_db.flush()
    seed_db.execute(user_roles.insert().values(user_id=analyst.id, role_id=analyst_role.id))
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


def test_ticket_sla_and_overdue(client):
    tok = _login(client, "admin", "AdminPass123!")
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post(
        "/tickets",
        headers=h,
        json={"title": "SLA critical", "severity": "CRITICAL"},
    )
    assert r.status_code == 200, r.text
    body = r.json()["ticket"]
    assert body["sla_hours"] == 24
    assert body["due_at"]
    assert body["overdue"] is False

    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    r2 = client.post(
        "/tickets",
        headers=h,
        json={"title": "Already late", "severity": "LOW", "due_at": past},
    )
    assert r2.status_code == 200
    assert r2.json()["ticket"]["overdue"] is True

    listed = client.get("/tickets?overdue=true", headers=h)
    assert listed.status_code == 200
    assert any(t["title"] == "Already late" for t in listed.json()["results"])


def test_pending_close_confirm(client):
    analyst = _login(client, "analyst1", "AnalystPass1!")
    admin = _login(client, "admin", "AdminPass123!")
    ah = {"Authorization": f"Bearer {analyst}"}
    created = client.post("/tickets", headers=ah, json={"title": "Close me", "severity": "MEDIUM"})
    tid = created.json()["ticket"]["id"]
    creator_id = created.json()["ticket"]["created_by_id"]

    client.post(
        f"/tickets/{tid}/assign",
        headers={"Authorization": f"Bearer {admin}"},
        json={"assignee_user_id": creator_id},
    )

    st = client.post(f"/tickets/{tid}/status", headers=ah, json={"status": "pending_close"})
    assert st.status_code == 200
    assert st.json()["status"] == "pending_close"

    closed = client.post(f"/tickets/{tid}/status", headers=ah, json={"status": "closed"})
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"


def test_telegram_stub_test(client):
    tok = _login(client, "admin", "AdminPass123!")
    h = {"Authorization": f"Bearer {tok}"}
    save = client.put(
        "/settings/integrations/telegram",
        headers=h,
        json={"enabled": True, "chat_id": "123"},
    )
    assert save.status_code == 200
    test = client.post("/settings/integrations/telegram/test", headers=h)
    assert test.status_code == 200
    msg = test.json()["message"].lower()
    assert "stub" in msg or "лог" in msg or "no-op" in msg or "токен" in msg


def test_setup_wizard_flow(client):
    tok = _login(client, "admin", "AdminPass123!")
    h = {"Authorization": f"Bearer {tok}"}
    st = client.get("/setup/status")
    assert st.status_code == 200
    assert st.json()["completed"] is False

    org = client.put("/setup/organization", headers=h, json={"organization_name": "АО Тест"})
    assert org.status_code == 200
    brand = client.put(
        "/setup/branding",
        headers=h,
        json={"product_name": "VBXTest", "login_title": "Hello"},
    )
    assert brand.status_code == 200
    fin = client.post("/setup/finish", headers=h)
    assert fin.status_code == 200
    st2 = client.get("/setup/status")
    assert st2.json()["completed"] is True


def test_search_views_with_columns(client):
    tok = _login(client, "admin", "AdminPass123!")
    h = {"Authorization": f"Bearer {tok}"}
    cols = {"columns": [{"id": "cve_id", "visible": True, "width": 120}], "rowDensity": "compact"}
    created = client.post(
        "/search/views",
        headers=h,
        json={"name": "Cols", "query": "", "filters": [], "columns": cols},
    )
    assert created.status_code == 200, created.text
    assert created.json()["columns"]["rowDensity"] == "compact"
    listed = client.get("/search/views", headers=h)
    assert any(v["name"] == "Cols" for v in listed.json())


def test_raw_json_policy_and_prune(client):
    tok = _login(client, "admin", "AdminPass123!")
    h = {"Authorization": f"Bearer {tok}"}

    off = client.put(
        "/settings/database/cve-store-raw-json",
        headers=h,
        json={"enabled": False},
    )
    assert off.status_code == 200

    settings = client.get("/settings/database", headers=h)
    assert settings.status_code == 200
    assert settings.json()["cve_store_raw_json"] is False

    bad = client.post(
        "/settings/database/prune-raw-json",
        headers=h,
        json={"confirm": False},
    )
    assert bad.status_code == 400
    ok = client.post(
        "/settings/database/prune-raw-json",
        headers=h,
        json={"confirm": True, "min_bytes": 10, "limit": 100},
    )
    assert ok.status_code == 200
