"""EPSS sync — mock by default; optional FIRST CSV feed via VBX_EPSS_MOCK=false.

Lifecycle: upsert by (cve_id, scored_at), then prune older scored_at generations.
"""

from __future__ import annotations

import csv
import gzip
import io
import re
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

# Keep newest N distinct scored_at values globally (enough for deltas + one spare).
EPSS_KEEP_GENERATIONS = 3

_SCORE_DATE_RE = re.compile(r"score_date:(\d{4}-\d{2}-\d{2})", re.IGNORECASE)


def prune_epss_history(
    db: Session, *, keep_generations: int = EPSS_KEEP_GENERATIONS
) -> int:
    """Delete rows whose scored_at is older than the newest N generations (global).

    ISO date strings sort lexicographically, so DESC order is chronological.
    """
    keep_n = max(1, int(keep_generations))
    dates = [
        row[0]
        for row in (
            db.query(EpssScore.scored_at)
            .filter(EpssScore.scored_at != "")
            .distinct()
            .order_by(EpssScore.scored_at.desc())
            .all()
        )
    ]
    if len(dates) <= keep_n:
        return 0
    keep = dates[:keep_n]
    deleted = (
        db.query(EpssScore)
        .filter(~EpssScore.scored_at.in_(keep))
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


def _upsert_score(
    db: Session,
    *,
    cve_id: str,
    score: float,
    percentile: float,
    scored_at: str,
    existing: dict[str, EpssScore] | None = None,
) -> str:
    """Upsert one row keyed by (cve_id, scored_at). Returns 'created' or 'updated'."""
    row = existing.get(cve_id) if existing is not None else None
    if row is None:
        row = (
            db.query(EpssScore)
            .filter(EpssScore.cve_id == cve_id, EpssScore.scored_at == scored_at)
            .first()
        )
        if row is not None and existing is not None:
            existing[cve_id] = row
    if row is not None:
        row.score = score
        row.percentile = percentile
        return "updated"
    obj = EpssScore(cve_id=cve_id, score=score, percentile=percentile, scored_at=scored_at)
    db.add(obj)
    if existing is not None:
        existing[cve_id] = obj
    return "created"


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
        action = _upsert_score(
            db,
            cve_id=cve_id,
            score=prev,
            percentile=max(0.0, pct - 0.05),
            scored_at=yesterday,
        )
        if action == "created":
            created += 1
        else:
            updated += 1

    for cve_id, score, pct in MOCK_SCORES:
        if not db.get(CveRecord, cve_id):
            continue
        action = _upsert_score(
            db, cve_id=cve_id, score=score, percentile=pct, scored_at=today
        )
        if action == "created":
            created += 1
        else:
            updated += 1
    db.commit()
    pruned = prune_epss_history(db)
    return {
        "created": created,
        "updated": updated,
        "pruned": pruned,
        "mode": "mock",
        "scored_at": today,
        "keep_generations": EPSS_KEEP_GENERATIONS,
    }


def _use_mock(db: Session) -> bool:
    settings = get_settings()
    # Profile/env decide baseline; DB setting can still force mock on when env says live
    if not settings.epss_mock_effective():
        # live feed unless admin explicitly forces mock in settings
        return get_setting(db, "epss_mock_mode", "false") == "true"
    return get_setting(db, "epss_mock_mode", "true") == "true"


def _parse_score_date(raw_text: str) -> str:
    """Prefer FIRST CSV header score_date; fall back to today."""
    for ln in raw_text.splitlines()[:10]:
        m = _SCORE_DATE_RE.search(ln)
        if m:
            return m.group(1)
    return date.today().isoformat()


def fetch_epss_csv(db: Session) -> dict:
    """Download FIRST EPSS CSV.gz and upsert scores for CVEs present in catalog."""
    created = 0
    updated = 0
    skipped = 0
    known = {row[0] for row in db.query(CveRecord.id).all()}
    with httpx.Client(timeout=180.0, follow_redirects=True) as client:
        resp = client.get(EPSS_CSV_URL)
        resp.raise_for_status()
        raw = gzip.decompress(resp.content)
    text = raw.decode("utf-8", errors="replace")
    scored_at = _parse_score_date(text)
    # latest score row per cve for this generation (avoid N+1)
    existing_gen = {
        row.cve_id: row
        for row in db.query(EpssScore).filter(EpssScore.scored_at == scored_at).all()
    }
    # Skip comment lines starting with #
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    batch = 0
    for row in reader:
        cve_id = (row.get("cve") or row.get("CVE") or "").strip().upper()
        if not cve_id.startswith("CVE-"):
            continue
        if cve_id not in known:
            skipped += 1
            continue
        try:
            score = float(row.get("epss") or 0)
            pct = float(row.get("percentile") or 0)
        except (TypeError, ValueError):
            continue
        action = _upsert_score(
            db,
            cve_id=cve_id,
            score=score,
            percentile=pct,
            scored_at=scored_at,
            existing=existing_gen,
        )
        if action == "created":
            created += 1
        else:
            updated += 1
        batch += 1
        if batch % 5000 == 0:
            db.commit()
    db.commit()
    pruned = prune_epss_history(db)
    return {
        "created": created,
        "updated": updated,
        "pruned": pruned,
        "skipped_unknown_cve": skipped,
        "mode": "api",
        "scored_at": scored_at,
        "keep_generations": EPSS_KEEP_GENERATIONS,
        "source": EPSS_CSV_URL,
        "catalog_size": len(known),
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
