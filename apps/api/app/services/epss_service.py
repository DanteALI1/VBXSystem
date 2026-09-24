"""EPSS leaderboards: top scores and top deltas."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import CveRecord, EpssScore


def _latest_by_cve(db: Session) -> dict[str, EpssScore]:
    rows = db.query(EpssScore).order_by(EpssScore.id.desc()).all()
    latest: dict[str, EpssScore] = {}
    for row in rows:
        if row.cve_id not in latest:
            latest[row.cve_id] = row
    return latest


def _previous_score(db: Session, cve_id: str, current_id: int) -> float | None:
    prev = (
        db.query(EpssScore)
        .filter(EpssScore.cve_id == cve_id, EpssScore.id < current_id)
        .order_by(EpssScore.id.desc())
        .first()
    )
    return prev.score if prev else None


def get_epss_overview(db: Session, *, limit: int = 25) -> dict:
    limit = min(max(1, limit), 100)
    latest = _latest_by_cve(db)
    top = sorted(latest.values(), key=lambda e: e.score, reverse=True)[:limit]

    top_predictions = []
    for e in top:
        cve = db.get(CveRecord, e.cve_id)
        top_predictions.append(
            {
                "cve_id": e.cve_id,
                "score": e.score,
                "percentile": e.percentile,
                "scored_at": e.scored_at,
                "severity": cve.cvss_severity if cve else "",
                "title": (cve.title or cve.id) if cve else e.cve_id,
                "is_cisa_kev": bool(cve.is_cisa_kev) if cve else False,
                "href": f"/vuln/{e.cve_id}",
            }
        )

    deltas = []
    for e in latest.values():
        prev = _previous_score(db, e.cve_id, e.id)
        if prev is None:
            continue
        delta = e.score - prev
        cve = db.get(CveRecord, e.cve_id)
        deltas.append(
            {
                "cve_id": e.cve_id,
                "score": e.score,
                "previous_score": prev,
                "delta": round(delta, 6),
                "percentile": e.percentile,
                "scored_at": e.scored_at,
                "severity": cve.cvss_severity if cve else "",
                "title": (cve.title or cve.id) if cve else e.cve_id,
                "href": f"/vuln/{e.cve_id}",
            }
        )
    deltas.sort(key=lambda x: abs(x["delta"]), reverse=True)
    return {
        "top_predictions": top_predictions,
        "top_deltas": deltas[:limit],
        "total_scored": len(latest),
    }
