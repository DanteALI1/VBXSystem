"""Auth flow tests using SQLite in-memory."""

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


def test_register_pending_cannot_login(client):
    r = client.post(
        "/auth/register",
        json={
            "username": "newbie",
            "email": "newbie@example.local",
            "password": "NewbiePass1!",
            "full_name": "Новый",
        },
    )
    assert r.status_code == 200

    login = client.post("/auth/login", json={"username": "newbie", "password": "NewbiePass1!"})
    assert login.status_code == 403
    assert "подтверждения" in login.json()["detail"]


def test_admin_login_and_approve(client):
    login = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert login.status_code == 200
    body = login.json()
    assert body.get("access_token")
    assert body.get("requires_2fa") is False
    token = body["access_token"]

    client.post(
        "/auth/register",
        json={
            "username": "alice",
            "email": "alice@example.local",
            "password": "AlicePass1!",
        },
    )

    users = client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert users.status_code == 200
    alice = next(u for u in users.json() if u["username"] == "alice")
    assert alice["status"] == "pending"

    approved = client.post(
        f"/users/{alice['id']}/approve",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "active"

    alice_login = client.post("/auth/login", json={"username": "alice", "password": "AlicePass1!"})
    assert alice_login.status_code == 200
    assert alice_login.json().get("access_token")


def test_users_forbidden_for_viewer(client):
    admin = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"}).json()
    admin_token = admin["access_token"]
    created = client.post(
        "/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": "viewer1",
            "email": "viewer1@example.local",
            "password": "ViewerPass1!",
            "roles": ["viewer"],
            "status": "active",
        },
    )
    assert created.status_code == 200
    vlogin = client.post("/auth/login", json={"username": "viewer1", "password": "ViewerPass1!"})
    assert vlogin.status_code == 200
    vtoken = vlogin.json()["access_token"]
    denied = client.get("/users", headers={"Authorization": f"Bearer {vtoken}"})
    assert denied.status_code == 403
