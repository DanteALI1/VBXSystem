"""EPSS sync — mock scores for demos; optional FIRST feed later."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import CveRecord, EpssScore


MOCK_SCORES = [
    # cve_id, score, percentile, previous-ish for delta demos
    ("CVE-2024-0001", 0.82, 0.97),
    ("CVE-2024-0002", 0.31, 0.78),
    ("CVE-2023-44487", 0.91, 0.99),
]


def seed_mock_epss(db: Session) -> dict:
    """Insert a previous generation then current scores so deltas are nonzero."""
    today = date.today().isoformat()
    yesterday = "2024-01-01"
    updated = 0
    created = 0

    # baseline generation
    for cve_id, score, pct in MOCK_SCORES:
        if not db.get(CveRecord, cve_id):
            continue
        prev = max(0.0, score - 0.12)
        existing = (
            db.query(EpssScore)
            .filter(EpssScore.cve_id == cve_id, EpssScore.scored_at == yesterday)
            .first()
        )
        if not existing:
            db.add(EpssScore(cve_id=cve_id, score=prev, percentile=max(0.0, pct - 0.05), scored_at=yesterday))
            created += 1

    # current generation
    for cve_id, score, pct in MOCK_SCORES:
        if not db.get(CveRecord, cve_id):
            continue
        latest = (
            db.query(EpssScore)
            .filter(EpssScore.cve_id == cve_id, EpssScore.scored_at == today)
            .first()
        )
        if latest:
            latest.score = score
            latest.percentile = pct
            updated += 1
        else:
            db.add(EpssScore(cve_id=cve_id, score=score, percentile=pct, scored_at=today))
            created += 1
    db.commit()
    return {"created": created, "updated": updated, "mode": "mock", "scored_at": today}


def run_epss_sync(db: Session) -> dict:
    return seed_mock_epss(db)
