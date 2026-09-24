"""W8 hardening: security headers and upload limits."""

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
os.environ["VBX_MAX_UPLOAD_BYTES"] = str(1024 * 1024)
os.environ["VBX_MAX_BDU_UPLOAD_BYTES"] = str(64)
os.environ["VBX_UPLOAD_DIR"] = "/tmp/vbx-test-uploads"

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


def _admin_headers(client: TestClient) -> dict:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_security_headers_on_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
    assert "strict-origin" in (r.headers.get("referrer-policy") or "")


def test_bdu_upload_rejects_non_xml(client: TestClient):
    h = _admin_headers(client)
    r = client.post(
        "/settings/database/bdu/upload",
        headers=h,
        files={"file": ("evil.txt", b"not-xml", "text/plain")},
    )
    assert r.status_code == 400


def test_bdu_upload_rejects_path_traversal(client: TestClient):
    h = _admin_headers(client)
    r = client.post(
        "/settings/database/bdu/upload",
        headers=h,
        files={"file": ("../etc/passwd.xml", b"<root/>", "application/xml")},
    )
    assert r.status_code == 400


def test_bdu_upload_rejects_oversized(client: TestClient):
    h = _admin_headers(client)
    # VBX_MAX_BDU_UPLOAD_BYTES=64 in this module
    payload = b"<r>" + (b"x" * 200) + b"</r>"
    r = client.post(
        "/settings/database/bdu/upload",
        headers=h,
        files={"file": ("big.xml", payload, "application/xml")},
    )
    assert r.status_code == 413


def test_request_rejects_large_content_length(client: TestClient):
    r = client.post(
        "/auth/login",
        content=b"{}",
        headers={
            "content-type": "application/json",
            "content-length": str(2 * 1024 * 1024),
        },
    )
    assert r.status_code == 413
