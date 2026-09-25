"""EPSS leaderboards: top scores and top deltas (SQL-efficient)."""

from __future__ import annotations

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.cache import cache_get, cache_set
from app.models import CveRecord, EpssScore

_EPSS_OVERVIEW_TTL = 60


def _total_scored(db: Session) -> int:
    return int(db.query(func.count(func.distinct(EpssScore.cve_id))).scalar() or 0)


def get_epss_history(db: Session, cve_id: str, *, limit: int = 90) -> list[dict]:
    """Chronological EPSS score points for sparkline / history charts."""
    cve_id = (cve_id or "").strip().upper()
    limit = min(max(1, limit), 365)
    if not cve_id:
        return []
    rows = (
        db.query(EpssScore)
        .filter(EpssScore.cve_id == cve_id)
        .order_by(EpssScore.scored_at.asc(), EpssScore.id.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            "scored_at": str(r.scored_at or ""),
            "score": float(r.score or 0),
            "percentile": float(r.percentile or 0),
        }
        for r in rows
    ]


def get_epss_overview(db: Session, *, limit: int = 25) -> dict:
    limit = min(max(1, limit), 100)
    cache_key = f"epss:overview:v1:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    total_scored = _total_scored(db)
    if total_scored == 0:
        empty = {"top_predictions": [], "top_deltas": [], "total_scored": 0}
        cache_set(cache_key, empty, _EPSS_OVERVIEW_TTL)
        return empty

    latest_ids = (
        db.query(func.max(EpssScore.id).label("mid")).group_by(EpssScore.cve_id).subquery()
    )
    top_rows = (
        db.query(EpssScore)
        .join(latest_ids, EpssScore.id == latest_ids.c.mid)
        .order_by(EpssScore.score.desc())
        .limit(limit)
        .all()
    )

    cve_ids = [e.cve_id for e in top_rows]
    cve_map = (
        {c.id: c for c in db.query(CveRecord).filter(CveRecord.id.in_(cve_ids)).all()}
        if cve_ids
        else {}
    )

    top_predictions = []
    for e in top_rows:
        cve = cve_map.get(e.cve_id)
        top_predictions.append(
            {
                "cve_id": e.cve_id,
                "score": e.score,
                "percentile": e.percentile,
                "scored_at": str(e.scored_at or ""),
                "severity": cve.cvss_severity if cve else "",
                "title": (cve.title or cve.id) if cve else e.cve_id,
                "is_cisa_kev": bool(cve.is_cisa_kev) if cve else False,
                "href": f"/vuln/{e.cve_id}",
            }
        )

    # Deltas: only CVEs with ≥2 score rows (avoids window over full 300k+ table)
    deltas: list[dict] = []
    try:
        sql = text(
            """
            WITH multi AS (
              SELECT cve_id
              FROM epss_scores
              GROUP BY cve_id
              HAVING COUNT(*) >= 2
            ),
            ranked AS (
              SELECT
                e.cve_id,
                e.score,
                e.percentile,
                e.scored_at,
                e.id,
                ROW_NUMBER() OVER (PARTITION BY e.cve_id ORDER BY e.id DESC) AS rn
              FROM epss_scores e
              INNER JOIN multi m ON m.cve_id = e.cve_id
            ),
            paired AS (
              SELECT
                cur.cve_id AS cve_id,
                cur.score AS score,
                cur.percentile AS percentile,
                cur.scored_at AS scored_at,
                prev.score AS previous_score,
                (cur.score - prev.score) AS delta
              FROM ranked cur
              INNER JOIN ranked prev
                ON prev.cve_id = cur.cve_id AND prev.rn = 2
              WHERE cur.rn = 1
            )
            SELECT cve_id, score, percentile, scored_at, previous_score, delta
            FROM paired
            ORDER BY ABS(delta) DESC
            LIMIT :lim
            """
        )
        rows = db.execute(sql, {"lim": limit}).mappings().all()
        delta_ids = [r["cve_id"] for r in rows]
        delta_cves = (
            {c.id: c for c in db.query(CveRecord).filter(CveRecord.id.in_(delta_ids)).all()}
            if delta_ids
            else {}
        )
        for r in rows:
            cve = delta_cves.get(r["cve_id"])
            deltas.append(
                {
                    "cve_id": r["cve_id"],
                    "score": float(r["score"]),
                    "previous_score": float(r["previous_score"]),
                    "delta": round(float(r["delta"]), 6),
                    "percentile": float(r["percentile"] or 0),
                    "scored_at": str(r["scored_at"] or ""),
                    "severity": cve.cvss_severity if cve else "",
                    "title": (cve.title or cve.id) if cve else r["cve_id"],
                    "href": f"/vuln/{r['cve_id']}",
                }
            )
    except Exception:
        deltas = []

    out = {
        "top_predictions": top_predictions,
        "top_deltas": deltas,
        "total_scored": total_scored,
    }
    cache_set(cache_key, out, _EPSS_OVERVIEW_TTL)
    return out
