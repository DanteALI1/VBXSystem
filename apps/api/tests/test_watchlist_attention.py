"""Watchlist + attention feed v2 + session-mode / cookies smoke."""

import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

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
os.environ.pop("VBX_EPSS_MOCK", None)
os.environ["VBX_PROFILE"] = "dev"
os.environ["VBX_AUTH_COOKIES"] = "true"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base, CisaKev, CveRecord
from app.seed import run_seed
from app.services.bdu_import import import_bdu_xml_content
from app.services.epss_sync import seed_mock_epss
from app.services.kev_sync import seed_mock_kev
from app.services.nvd_sync import seed_mock_cves

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bdu.xml"


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
    seed_mock_cves(seed_db)
    seed_mock_kev(seed_db)
    import_bdu_xml_content(seed_db, FIXTURE.read_text(encoding="utf-8"))
    seed_mock_epss(seed_db)
    # Mark KEV as newly added today for kev_new reason
    for k in seed_db.query(CisaKev).all():
        k.date_added = date.today().isoformat()
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


def _token(client: TestClient) -> str:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_session_mode_cookies_flag(client):
    r = client.get("/auth/session-mode")
    assert r.status_code == 200
    assert r.json()["cookies"] is True


def test_watchlist_crud_and_attention(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    created = client.post("/watchlist", headers=h, json={"kind": "cve", "value": "CVE-2024-0001"})
    assert created.status_code == 200, created.text
    assert created.json()["kind"] == "cve"
    listed = client.get("/watchlist", headers=h)
    assert listed.status_code == 200
    assert any(x["value"] == "CVE-2024-0001" for x in listed.json())

    dash = client.get("/dashboard", headers=h)
    assert dash.status_code == 200
    feed = dash.json()["attention_feed"]
    assert feed
    reasons = {x["reason"] for x in feed}
    assert reasons & {"watchlist", "kev_new", "kev", "epss", "critical"}
    assert any(x["id"] == "CVE-2024-0001" and x["reason"] == "watchlist" for x in feed)

    eid = created.json()["id"]
    deleted = client.delete(f"/watchlist/{eid}", headers=h)
    assert deleted.status_code == 200


def test_cookie_auth_path(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200
    # Set-Cookie present when flag on
    assert client.cookies.get("vbx_access") or "vbx_access" in r.headers.get("set-cookie", "").lower()
    me = client.get("/auth/me")  # cookie jar from TestClient
    # Bearer still works; cookie also after login response
    if client.cookies.get("vbx_access"):
        assert me.status_code == 200
    logout = client.post("/auth/logout")
    assert logout.status_code == 200


def test_epss_profile_prod_default_live():
    os.environ["VBX_PROFILE"] = "prod"
    os.environ.pop("VBX_EPSS_MOCK", None)
    get_settings.cache_clear()
    assert get_settings().epss_mock_effective() is False
    os.environ["VBX_PROFILE"] = "dev"
    get_settings.cache_clear()
