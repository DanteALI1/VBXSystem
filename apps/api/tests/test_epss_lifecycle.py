"""EPSS upsert + history prune lifecycle."""

import os
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine, func
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

from app.models import Base, CveRecord, EpssScore
from app.services.epss_service import get_epss_overview
from app.services.epss_sync import (
    EPSS_KEEP_GENERATIONS,
    _parse_score_date,
    _upsert_score,
    prune_epss_history,
    seed_mock_epss,
)


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    session = TestingSession()
    for cve_id in ("CVE-2024-0001", "CVE-2024-0002", "CVE-2023-44487"):
        session.add(
            CveRecord(
                id=cve_id,
                title=cve_id,
                description="",
                cvss_score=9.0,
                cvss_severity="CRITICAL",
            )
        )
    session.commit()
    yield session
    session.close()
    get_settings.cache_clear()


def test_upsert_same_scored_at_does_not_duplicate(db):
    today = date.today().isoformat()
    assert _upsert_score(db, cve_id="CVE-2024-0001", score=0.1, percentile=0.2, scored_at=today) == "created"
    db.commit()
    assert _upsert_score(db, cve_id="CVE-2024-0001", score=0.9, percentile=0.95, scored_at=today) == "updated"
    db.commit()
    rows = db.query(EpssScore).filter(EpssScore.cve_id == "CVE-2024-0001").all()
    assert len(rows) == 1
    assert rows[0].score == 0.9
    assert rows[0].percentile == 0.95


def test_prune_keeps_newest_generations(db):
    base = date(2024, 6, 1)
    for i in range(5):
        scored_at = (base + timedelta(days=i)).isoformat()
        for cve_id in ("CVE-2024-0001", "CVE-2024-0002"):
            db.add(
                EpssScore(
                    cve_id=cve_id,
                    score=0.1 * i,
                    percentile=0.5,
                    scored_at=scored_at,
                )
            )
    db.commit()
    assert db.query(func.count(EpssScore.id)).scalar() == 10

    pruned = prune_epss_history(db, keep_generations=3)
    assert pruned == 4  # 2 CVEs × 2 old dates
    remaining = {
        r[0]
        for r in db.query(EpssScore.scored_at).distinct().all()
    }
    assert remaining == {
        (base + timedelta(days=2)).isoformat(),
        (base + timedelta(days=3)).isoformat(),
        (base + timedelta(days=4)).isoformat(),
    }
    assert db.query(func.count(EpssScore.id)).scalar() == 6


def test_seed_mock_idempotent_and_overview(db):
    first = seed_mock_epss(db)
    second = seed_mock_epss(db)
    assert first["created"] >= 1
    assert second["updated"] >= 1
    assert second["created"] == 0
    # At most one row per (cve, scored_at); mock uses 2 generations
    total = db.query(func.count(EpssScore.id)).scalar()
    distinct_pairs = db.query(
        func.count(func.distinct(EpssScore.cve_id + "|" + EpssScore.scored_at))
    ).scalar()
    assert total == distinct_pairs
    assert total <= 3 * EPSS_KEEP_GENERATIONS  # sanity

    overview = get_epss_overview(db, limit=10)
    assert overview["total_scored"] >= 1
    assert overview["top_predictions"]
    assert any(x["cve_id"] == "CVE-2023-44487" for x in overview["top_predictions"])
    assert overview["top_deltas"]


def test_parse_score_date_from_header():
    raw = "#model_version:v2025.03.14,score_date:2025-03-17\ncve,epss,percentile\n"
    assert _parse_score_date(raw) == "2025-03-17"
