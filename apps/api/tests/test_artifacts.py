"""Artifact path sanitization + evidence rewrite on ingest."""

from __future__ import annotations

import base64
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
os.environ["VBX_MODULE_TOKEN"] = "test-module-token"
os.environ["VBX_ADMIN_USERNAME"] = "admin"
os.environ["VBX_ADMIN_EMAIL"] = "admin@example.local"
os.environ["VBX_ADMIN_PASSWORD"] = "AdminPass123!"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import get_db
from app.main import create_app
from app.models import Base
from app.seed import run_seed
from app.services import artifacts as artifacts_svc
from app.services import module_queue as mq


@pytest.fixture()
def artifacts_tmpdir(tmp_path, monkeypatch):
    root = tmp_path / "artifacts"
    root.mkdir()
    (root / "gowitness").mkdir()
    monkeypatch.setenv("VBX_ARTIFACTS_DIR", str(root))
    get_settings.cache_clear()
    yield root
    get_settings.cache_clear()


@pytest.fixture()
def client(artifacts_tmpdir):
    mq.clear_local_state()
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
    mq.clear_local_state()


def _login(client: TestClient) -> str:
    r = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


_MOCK_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_sanitize_artifact_key_rejects_traversal(artifacts_tmpdir):
    with pytest.raises(ValueError):
        artifacts_svc.sanitize_artifact_key("../etc/passwd")
    with pytest.raises(ValueError):
        artifacts_svc.sanitize_artifact_key("/absolute/path")
    with pytest.raises(ValueError):
        artifacts_svc.sanitize_artifact_key("gowitness/../../secret")
    with pytest.raises(ValueError):
        artifacts_svc.resolve_artifact_path("gowitness/../../../etc/passwd")

    key = artifacts_svc.sanitize_artifact_key("gowitness/42/shot.png")
    assert key == "gowitness/42/shot.png"
    path = artifacts_svc.resolve_artifact_path(key)
    assert path == (artifacts_tmpdir / "gowitness" / "42" / "shot.png").resolve()


def test_normalize_finding_evidence_copies_and_rewrites(artifacts_tmpdir):
    src_dir = artifacts_tmpdir / "gowitness"
    src = src_dir / "raw-shot.png"
    src.write_bytes(_MOCK_PNG)

    # Simulate worker path under /data (alias → artifacts/gowitness)
    # Place file where alias mapping expects it.
    worker_name = "host_99.png"
    aliased = src_dir / worker_name
    aliased.write_bytes(_MOCK_PNG)

    # Monkeypatch alias resolution: write a file and point screenshot_path at mapped location
    evidence = {
        "screenshot_path": str(aliased),
        "thumbnail_b64": base64.b64encode(_MOCK_PNG).decode("ascii"),
        "url": "http://scan-target",
    }
    out = artifacts_svc.normalize_finding_evidence(
        evidence,
        module_id="gowitness",
        job_id=99,
    )
    assert out["module"] == "gowitness"
    assert out["artifact_key"] == "gowitness/99/host_99.png"
    dest = artifacts_tmpdir / "gowitness" / "99" / "host_99.png"
    assert dest.is_file()
    assert dest.read_bytes() == _MOCK_PNG
    assert out.get("thumbnail_b64")


def test_ingest_rewrites_artifact_and_serves(client: TestClient, artifacts_tmpdir):
    tok = _login(client)
    auth = {"Authorization": f"Bearer {tok}"}
    mod = {"X-Module-Token": "test-module-token"}

    r = client.post(
        "/internal/modules/register",
        headers=mod,
        json={"id": "gowitness", "version": "0.1.0", "capabilities": ["web.recon"]},
    )
    assert r.status_code == 200, r.text

    r = client.post(
        "/modules/gowitness/jobs",
        headers=auth,
        json={"params": {"target": "http://scan-target"}},
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]

    r = client.post(
        "/internal/modules/jobs/claim",
        headers=mod,
        json={"module_id": "gowitness", "lease_owner": "gw-1", "lease_seconds": 60},
    )
    assert r.status_code == 200, r.text

    shot = artifacts_tmpdir / "gowitness" / f"shot_{job_id}.png"
    shot.write_bytes(_MOCK_PNG)

    r = client.post(
        f"/internal/modules/jobs/{job_id}/results",
        headers=mod,
        json={
            "lease_owner": "gw-1",
            "status": "success",
            "findings": [
                {
                    "title": "Screenshot scan-target",
                    "severity": "info",
                    "target": "scan-target",
                    "asset": {"hostname": "scan-target", "ip": ""},
                    "evidence": {
                        "module": "gowitness",
                        "url": "http://scan-target",
                        "screenshot_path": str(shot),
                        "thumbnail_b64": base64.b64encode(_MOCK_PNG).decode("ascii"),
                    },
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 1
    finding = body["findings"][0]
    fid = finding["id"]
    key = finding["evidence"]["artifact_key"]
    assert key.startswith(f"gowitness/{job_id}/")
    assert (artifacts_tmpdir / Path(key)).is_file()

    r = client.get(f"/findings/{fid}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["evidence"]["artifact_key"] == key
    assert r.json()["evidence"].get("thumbnail_b64")

    r = client.get(f"/findings/{fid}/artifacts/{key}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("image/png")
    assert r.content == _MOCK_PNG

    r = client.get(f"/artifacts/{key}", headers=auth)
    assert r.status_code == 200, r.text
    assert r.content == _MOCK_PNG

    # Path traversal rejected
    r = client.get(f"/artifacts/gowitness/../../etc/passwd", headers=auth)
    assert r.status_code in {400, 404}

    r = client.get(f"/findings/{fid}/artifacts/../etc/passwd", headers=auth)
    assert r.status_code in {400, 404}
