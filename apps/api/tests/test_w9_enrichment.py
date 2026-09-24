"""W9 enrichment: branding, local IDs, system metrics."""

from __future__ import annotations

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
from app.models import Base
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


def _headers(client: TestClient) -> dict:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_public_branding(client: TestClient):
    r = client.get("/branding")
    assert r.status_code == 200
    data = r.json()
    assert data["product_name"]
    assert "local_id_prefix" in data


def test_local_vuln_create_and_search(client: TestClient):
    headers = _headers(client)
    r = client.post(
        "/local",
        headers=headers,
        json={
            "title": "Внутренняя уязвимость теста",
            "description": "demo local",
            "severity": "HIGH",
            "vendor": "Acme",
            "product_name": "Agent",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"].startswith("VBX-")
    assert body["severity"] == "HIGH"

    detail = client.get(f"/local/{body['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["title"] == "Внутренняя уязвимость теста"

    search = client.get("/search", headers=headers, params={"q": body["id"]})
    assert search.status_code == 200
    ids = [h["id"] for h in search.json()["results"]]
    assert body["id"] in ids


def test_system_metrics(client: TestClient):
    headers = _headers(client)
    r = client.get("/settings/system/metrics", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "cpu" in data and "ram" in data and "disk_root" in data


def test_branding_update(client: TestClient):
    headers = _headers(client)
    r = client.put(
        "/settings/branding",
        headers=headers,
        json={
            "product_name": "VBX",
            "organization_name": "АО Тест",
            "login_title": "Тестовый вход",
            "login_text": "Текст",
            "local_id_prefix": "TST",
        },
    )
    assert r.status_code == 200, r.text
    pub = client.get("/branding").json()
    assert pub["organization_name"] == "АО Тест"
    assert pub["local_id_prefix"] == "TST"
