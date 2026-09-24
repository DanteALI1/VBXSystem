"""EPSS sync — mock by default; optional FIRST CSV feed via VBX_EPSS_MOCK=false."""

from __future__ import annotations

import csv
import gzip
import io
from datetime import date

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CveRecord, EpssScore
from app.services.auth_helpers import get_setting

MOCK_SCORES = [
    ("CVE-2024-0001", 0.82, 0.97),
    ("CVE-2024-0002", 0.31, 0.78),
    ("CVE-2023-44487", 0.91, 0.99),
]

EPSS_CSV_URL = "https://epss.empiricalsecurity.com/epss_scores-current.csv.gz"


def seed_mock_epss(db: Session) -> dict:
    """Insert a previous generation then current scores so deltas are nonzero."""
    today = date.today().isoformat()
    yesterday = "2024-01-01"
    updated = 0
    created = 0

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
            db.add(
                EpssScore(
                    cve_id=cve_id,
                    score=prev,
                    percentile=max(0.0, pct - 0.05),
                    scored_at=yesterday,
                )
            )
            created += 1

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


def _use_mock(db: Session) -> bool:
    settings = get_settings()
    # Profile/env decide baseline; DB setting can still force mock on when env says live
    if not settings.epss_mock_effective():
        # live feed unless admin explicitly forces mock in settings
        return get_setting(db, "epss_mock_mode", "false") == "true"
    return get_setting(db, "epss_mock_mode", "true") == "true"


def fetch_epss_csv(db: Session) -> dict:
    """Download FIRST EPSS CSV.gz and upsert scores for CVEs present in catalog."""
    today = date.today().isoformat()
    created = 0
    updated = 0
    skipped = 0
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        resp = client.get(EPSS_CSV_URL)
        resp.raise_for_status()
        raw = gzip.decompress(resp.content)
    text = raw.decode("utf-8", errors="replace")
    # Skip comment lines starting with #
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    batch = 0
    for row in reader:
        cve_id = (row.get("cve") or row.get("CVE") or "").strip().upper()
        if not cve_id.startswith("CVE-"):
            continue
        if not db.get(CveRecord, cve_id):
            skipped += 1
            continue
        try:
            score = float(row.get("epss") or 0)
            pct = float(row.get("percentile") or 0)
        except (TypeError, ValueError):
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
        batch += 1
        if batch % 2000 == 0:
            db.commit()
    db.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped_unknown_cve": skipped,
        "mode": "api",
        "scored_at": today,
        "source": EPSS_CSV_URL,
    }


def run_epss_sync(db: Session) -> dict:
    if _use_mock(db):
        return seed_mock_epss(db)
    try:
        return fetch_epss_csv(db)
    except Exception as exc:
        # Fail soft to mock so UI/dashboard keep working
        stats = seed_mock_epss(db)
        stats["fallback"] = "mock"
        stats["error"] = str(exc)[:500]
        return stats
