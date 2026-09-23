"""Search & vulnerability detail API tests."""

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

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base, EpssScore
from app.seed import run_seed
from app.services.bdu_import import import_bdu_xml_content
from app.services.kev_sync import seed_mock_kev
from app.services.nvd_sync import seed_mock_cves

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bdu.xml"


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
    seed_mock_cves(seed_db)
    seed_mock_kev(seed_db)
    import_bdu_xml_content(seed_db, FIXTURE.read_text(encoding="utf-8"))
    seed_db.add(EpssScore(cve_id="CVE-2024-0001", score=0.42, percentile=0.91, scored_at="2024-01-01"))
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


def test_search_finds_cve_and_standalone_bdu(client):
    tok = _token(client)
    r = client.get("/search", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    ids = {hit["id"] for hit in body["results"]}
    assert "CVE-2024-0001" in ids
    assert "CVE-2023-44487" in ids
    assert "BDU:2024-00002" in ids
    kev_hit = next(h for h in body["results"] if h["id"] == "CVE-2023-44487")
    assert kev_hit["is_cisa_kev"] is True
    bdu_linked = next(h for h in body["results"] if h["id"] == "CVE-2024-0001")
    assert bdu_linked["has_bdu"] is True
    assert bdu_linked["epss"]["score"] == pytest.approx(0.42)


def test_search_query_bdu_text(client):
    tok = _token(client)
    r = client.get(
        "/search",
        params={"q": "LocalVendor"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    ids = {h["id"] for h in r.json()["results"]}
    assert "BDU:2024-00002" in ids


def test_search_kev_filter(client):
    tok = _token(client)
    r = client.get(
        "/search",
        params={"kev": True},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    results = r.json()["results"]
    assert results
    assert all(h["is_cisa_kev"] for h in results)
    assert all(h["kind"] == "cve" for h in results)


def test_cve_detail_with_bdu_and_kev(client):
    tok = _token(client)
    r = client.get("/vuln/CVE-2024-0001", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "CVE-2024-0001"
    assert any(b["id"] == "BDU:2024-00001" for b in data["bdu"])

    kev = client.get("/vuln/CVE-2023-44487", headers={"Authorization": f"Bearer {tok}"})
    assert kev.status_code == 200
    assert kev.json()["is_cisa_kev"] is True
    assert kev.json()["kev"] is not None


def test_bdu_detail_standalone(client):
    tok = _token(client)
    r = client.get("/bdu/BDU:2024-00002", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "BDU:2024-00002"
    assert data["is_standalone"] is True


def test_search_requires_auth(client):
    assert client.get("/search").status_code in (401, 403)
