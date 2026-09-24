"""CVEQL parser + execution + dashboard/EPSS smoke."""

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
from app.models import Base
from app.seed import run_seed
from app.services.bdu_import import import_bdu_xml_content
from app.services.cveql_parser import CveqlParseError, parse_cveql
from app.services.epss_sync import seed_mock_epss
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
    seed_mock_epss(seed_db)
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


def test_parse_basic_and_or():
    ast = parse_cveql('severity = "CRITICAL" and cvss_score >= 9')
    assert ast is not None
    ast2 = parse_cveql('is_cisa_kev = true or description ~ "HTTP"')
    assert ast2 is not None


def test_parse_rejects_sql_injection():
    with pytest.raises(CveqlParseError):
        parse_cveql("id = \"x\"; DROP TABLE cves")
    with pytest.raises(CveqlParseError):
        parse_cveql("id = x union select 1")
    with pytest.raises(CveqlParseError):
        parse_cveql("unknown_field = 1")


def test_cveql_examples_execute(client):
    tok = _token(client)
    help_r = client.get("/cveql/help", headers={"Authorization": f"Bearer {tok}"})
    assert help_r.status_code == 200
    examples = help_r.json()["examples"]
    assert examples
    for ex in examples:
        r = client.post(
            "/cveql/execute",
            headers={"Authorization": f"Bearer {tok}"},
            json={"query": ex["query"]},
        )
        assert r.status_code == 200, f"{ex['title']}: {r.text}"
        body = r.json()
        assert "results" in body
        assert body["total"] >= 0


def test_cveql_critical_finds_mock(client):
    tok = _token(client)
    r = client.post(
        "/cveql/execute",
        headers={"Authorization": f"Bearer {tok}"},
        json={"query": 'severity = "CRITICAL"'},
    )
    assert r.status_code == 200
    ids = {x["id"] for x in r.json()["results"]}
    assert "CVE-2024-0001" in ids


def test_cveql_injection_rejected_http(client):
    tok = _token(client)
    r = client.post(
        "/cveql/execute",
        headers={"Authorization": f"Bearer {tok}"},
        json={"query": "id = a; select * from users"},
    )
    assert r.status_code == 400


def test_dashboard_aggregates(client):
    tok = _token(client)
    r = client.get("/dashboard", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    assert body["kpis"]["cves_today"] >= 1
    assert "activity" in body
    assert "sync_health" in body


def test_epss_overview(client):
    tok = _token(client)
    r = client.get("/epss", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    assert body["total_scored"] >= 1
    assert body["top_predictions"]
    assert any(x["cve_id"] == "CVE-2023-44487" for x in body["top_predictions"])
    assert body["top_deltas"]
