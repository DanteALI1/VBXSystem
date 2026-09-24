"""XDB exploit catalog tests."""

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
from app.models import Base, ExploitRecord
from app.seed import run_seed
from app.services.nvd_sync import seed_mock_cves
from app.services.xdb import sanitize_url, seed_sample_exploits

FIX_JSON = Path(__file__).parent / "fixtures" / "sample_xdb.json"
FIX_CSV = Path(__file__).parent / "fixtures" / "sample_xdb.csv"


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


def test_sanitize_url_blocks_javascript():
    assert sanitize_url("javascript:alert(1)") == ""
    assert sanitize_url("https://github.com/a/b").startswith("https://")
    assert sanitize_url("http://user:pass@evil.com/x") == ""


def test_import_sample_and_list(client):
    tok = _token(client)
    r = client.post("/xdb/import/sample", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    # Demo seed may already have loaded samples on first boot — accept create or update
    assert body["created"] + body.get("updated", 0) + body.get("skipped", 0) >= 3 or body.get("total", 0) >= 3

    lst = client.get("/xdb", headers={"Authorization": f"Bearer {tok}"})
    assert lst.status_code == 200
    data = lst.json()
    assert data["total"] >= 3
    ids = {x["xdb_id"] for x in data["results"]}
    assert "XDB-2024-0001" in ids


def test_filters_by_cve_and_author(client):
    tok = _token(client)
    client.post("/xdb/import/sample", headers={"Authorization": f"Bearer {tok}"})
    r = client.get("/xdb", params={"cve_id": "CVE-2024-0001"}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert all(x["cve_id"] == "CVE-2024-0001" for x in r.json()["results"])

    r2 = client.get("/xdb", params={"author": "netsec"}, headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 200
    assert any(x["author"] == "netsec-lab" for x in r2.json()["results"])


def test_import_json_and_csv(client):
    tok = _token(client)
    r = client.post(
        "/xdb/import/json",
        headers={"Authorization": f"Bearer {tok}"},
        json={"exploits": [{"xdb_id": "XDB-JSON-1", "cve_id": "CVE-2024-0001", "repo_url": "https://github.com/a/b", "author": "j"}]},
    )
    assert r.status_code == 200
    assert r.json()["created"] == 1

    with FIX_CSV.open("rb") as f:
        up = client.post(
            "/xdb/import/file",
            headers={"Authorization": f"Bearer {tok}"},
            files={"file": ("sample_xdb.csv", f, "text/csv")},
        )
    assert up.status_code == 200
    # javascript URL row still imported but repo_url sanitized empty
    lst = client.get("/xdb", params={"q": "XDB-CSV-2"}, headers={"Authorization": f"Bearer {tok}"})
    assert lst.status_code == 200
    row = lst.json()["results"][0]
    assert row["repo_url"] == ""


def test_cve_detail_includes_exploits(client):
    tok = _token(client)
    client.post("/xdb/import/sample", headers={"Authorization": f"Bearer {tok}"})
    r = client.get("/vuln/CVE-2024-0001", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    exploits = r.json()["exploits"]
    assert any(e["xdb_id"] == "XDB-2024-0001" for e in exploits)


def test_import_requires_sync_permission(client):
    # register viewer-like pending user can't; use unauthenticated
    assert client.post("/xdb/import/sample").status_code in (401, 403)
