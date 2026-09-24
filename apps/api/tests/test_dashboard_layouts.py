"""Dashboard layout templates API tests."""

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
os.environ["VBX_AUTH_COOKIES"] = "false"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base
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


def test_classic_seeded_and_active(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    listed = client.get("/dashboard/layouts", headers=h)
    assert listed.status_code == 200
    rows = listed.json()
    assert any(r["is_system"] and r["slug"] == "vbx-classic" for r in rows)
    system_slugs = {r["slug"] for r in rows if r["is_system"]}
    assert {"vbx-classic", "vbx-analyst", "vbx-ops", "vbx-compact"} <= system_slugs
    classic = next(r for r in rows if r["slug"] == "vbx-classic")
    assert classic["layout"]["widgets"]

    active = client.get("/dashboard/layouts/active", headers=h)
    assert active.status_code == 200
    assert active.json()["slug"] == "vbx-classic"


def test_save_as_from_classic_then_overwrite(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    classic = next(r for r in client.get("/dashboard/layouts", headers=h).json() if r["is_system"])

    # Customize Classic in UI → Save as new personal
    created = client.post(
        "/dashboard/layouts",
        headers=h,
        json={
            "name": "Мой дашборд",
            "source_id": classic["id"],
            "layout": {
                "version": 1,
                "cols": 12,
                "widgets": [
                    {"i": "kpi_cve", "type": "kpi_cve", "x": 0, "y": 0, "w": 6, "h": 2},
                    {"i": "attention_feed", "type": "attention_feed", "x": 0, "y": 2, "w": 12, "h": 5},
                ],
            },
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["is_system"] is False
    assert body["name"] == "Мой дашборд"
    assert len(body["layout"]["widgets"]) == 2

    active = client.get("/dashboard/layouts/active", headers=h).json()
    assert active["id"] == body["id"]

    # Overwrite personal
    updated = client.put(
        f"/dashboard/layouts/{body['id']}",
        headers=h,
        json={
            "name": "Мой дашборд v2",
            "layout": {
                "version": 1,
                "cols": 12,
                "widgets": [{"i": "kpi_kev", "type": "kpi_kev", "x": 0, "y": 0, "w": 4, "h": 2}],
            },
        },
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Мой дашборд v2"
    assert len(updated.json()["layout"]["widgets"]) == 1

    # Cannot PUT system
    bad = client.put(
        f"/dashboard/layouts/{classic['id']}",
        headers=h,
        json={"name": "hack"},
    )
    assert bad.status_code == 403

    # Delete personal
    deleted = client.delete(f"/dashboard/layouts/{body['id']}", headers=h)
    assert deleted.status_code == 200
    active2 = client.get("/dashboard/layouts/active", headers=h).json()
    assert active2["is_system"] is True
