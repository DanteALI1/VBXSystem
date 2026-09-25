"""OIDC SSO staging login flow."""

import os
from contextlib import asynccontextmanager
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["VBX_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["VBX_SECRET_KEY"] = "test-secret-sso"
os.environ["VBX_REDIS_URL"] = "redis://localhost:6379/15"
os.environ["VBX_ADMIN_USERNAME"] = "admin"
os.environ["VBX_ADMIN_EMAIL"] = "admin@example.local"
os.environ["VBX_ADMIN_PASSWORD"] = "AdminPass123!"
os.environ["VBX_PUBLIC_URL"] = "http://testserver"
os.environ["VBX_AUTH_COOKIES"] = "false"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base, User
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
    set_setting(seed_db, "sso_enabled", "true")
    set_setting(seed_db, "sso_staging", "true")
    set_setting(seed_db, "sso_redirect_uri", "http://testserver/auth/sso/callback")
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
    with TestClient(app, follow_redirects=False) as c:
        yield c, TestingSession


def test_sso_status_public(client):
    c, _ = client
    r = c.get("/auth/sso/status")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert body["staging"] is True


def test_sso_staging_login_issues_tokens(client):
    c, Session = client
    start = c.get("/auth/sso/login?next=/dashboard")
    assert start.status_code == 302
    loc = start.headers["location"]
    assert "code=vbx-staging" in loc
    assert "state=" in loc

    parsed = urlparse(loc)
    qs = parse_qs(parsed.query)
    cb = c.get(
        f"/auth/sso/callback?code={qs['code'][0]}&state={qs['state'][0]}&format=json",
        headers={"Accept": "application/json"},
    )
    assert cb.status_code == 200, cb.text
    data = cb.json()
    assert data["access_token"]
    assert data["next"] == "/dashboard"

    db = Session()
    user = db.query(User).filter_by(auth_provider="oidc").one()
    assert user.username == "sso_demo"
    assert user.external_sub == "vbx-staging-sso"
    db.close()

    me = c.get("/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "sso_demo"


def test_sso_disabled_blocks_login(client):
    c, Session = client
    db = Session()
    set_setting(db, "sso_enabled", "false")
    db.close()
    r = c.get("/auth/sso/login")
    assert r.status_code == 400
