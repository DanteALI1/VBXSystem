"""P2: EPSS history, CSV export, metrics, watch status."""

import os
from contextlib import asynccontextmanager
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

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base, EpssScore
from app.seed import run_seed
from app.services.epss_sync import seed_mock_epss
from app.services.nvd_sync import seed_mock_cves


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
    seed_mock_epss(seed_db)
    # Extra history point for sparkline (distinct scored_at)
    seed_db.add(
        EpssScore(cve_id="CVE-2024-0001", score=0.1, percentile=0.2, scored_at="2023-12-01")
    )
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


def test_metrics_endpoint(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "sync" in body
    assert "scan" in body
    assert "running_jobs" in body["scan"]
    assert "stale_leases_reclaimed" in body["scan"]


def test_epss_history_and_cve_detail(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    hist = client.get("/epss/CVE-2024-0001/history", headers=h)
    assert hist.status_code == 200, hist.text
    assert len(hist.json()["points"]) >= 1

    detail = client.get("/vuln/CVE-2024-0001", headers=h)
    assert detail.status_code == 200
    body = detail.json()
    assert "epss_history" in body
    assert isinstance(body["epss_history"], list)


def test_watch_status(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    st = client.get("/watchlist/cve/CVE-2024-0001", headers=h)
    assert st.status_code == 200
    assert st.json()["watching"] is False
    created = client.post("/watchlist", headers=h, json={"kind": "cve", "value": "CVE-2024-0001"})
    assert created.status_code == 200
    st2 = client.get("/watchlist/cve/CVE-2024-0001", headers=h)
    assert st2.json()["watching"] is True


def test_cveql_csv_export(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post(
        "/cveql/export",
        headers=h,
        json={"query": 'severity = "CRITICAL"', "limit": 50},
    )
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "id," in r.text or "id" in r.text.splitlines()[0]


def test_audit_export(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    r = client.get("/settings/security/audit/export?limit=20", headers=h)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")


def test_epss_export(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    r = client.get("/epss/export?limit=25", headers=h)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "cve_id" in r.text


def test_search_views_crud(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    created = client.post(
        "/search/views",
        headers=h,
        json={"name": "Critical", "query": 'severity = "CRITICAL"', "filters": [], "columns": {}},
    )
    assert created.status_code == 200, created.text
    listed = client.get("/search/views", headers=h)
    assert listed.status_code == 200
    assert any(v["name"] == "Critical" for v in listed.json())
