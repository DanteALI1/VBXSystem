"""W6 settings suite: notifications, security, integrations, API keys."""

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

from app.db import get_db
from app.main import create_app
from app.models import Base, Group
from app.seed import run_seed
from app.services.auth_helpers import set_setting


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
    # default SMTP to localhost unreachable — tests that need SMTP will mock or skip
    set_setting(seed_db, "smtp_host", "127.0.0.1")
    set_setting(seed_db, "smtp_port", "1")
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


def _token(client: TestClient) -> str:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_notification_prefs_roundtrip(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    r = client.get("/settings/notifications", headers=h)
    assert r.status_code == 200
    body = r.json()
    body["bdu_import"] = True
    body["channel_modal"] = True
    u = client.put("/settings/notifications", headers=h, json=body)
    assert u.status_code == 200
    assert u.json()["bdu_import"] is True


def test_security_force_2fa_and_audit(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    r = client.put("/settings/security", headers=h, json={"force_2fa": True})
    assert r.status_code == 200
    assert r.json()["force_2fa"] is True
    audit = client.get("/settings/security/audit", headers=h)
    assert audit.status_code == 200
    assert any(a["action"] == "security.update" for a in audit.json())


def test_ldap_group_sync_creates_groups(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    client.put("/settings/integrations/ldap", headers=h, json={"mock_mode": True, "host": ""})
    r = client.post("/settings/integrations/ldap/sync-groups", headers=h, json={"dry_run": False})
    assert r.status_code == 200
    assert r.json()["created"] >= 1
    # also via groups endpoint
    r2 = client.post("/groups/ad/sync", headers=h, json={"dry_run": False})
    assert r2.status_code == 200
    assert r2.json()["updated"] >= 1


def test_api_key_can_call_protected_read(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    created = client.post(
        "/settings/api-keys",
        headers=h,
        json={"name": "ci", "scopes": ["vuln:read"], "expires_days": 30},
    )
    assert created.status_code == 200
    secret = created.json()["secret"]
    assert secret.startswith("vbx_")

    # search requires auth
    r = client.get("/search", headers={"Authorization": f"Bearer {secret}"})
    assert r.status_code == 200

    # header form
    r2 = client.get("/search", headers={"X-API-Key": secret})
    assert r2.status_code == 200

    # insufficient scope for sync
    bad = client.post("/epss/sync", headers={"X-API-Key": secret})
    assert bad.status_code == 403


def test_smtp_test_fails_fast_without_mailhog(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    # port 1 should fail quickly
    r = client.post("/settings/integrations/smtp/test", headers=h, json={"to": "a@b.c"})
    assert r.status_code == 400
    assert "SMTP" in r.json()["detail"]
