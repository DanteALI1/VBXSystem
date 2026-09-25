"""Finding risk score / priority / SLA helpers."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import Asset, CveRecord, EpssScore, Finding, utcnow

SEVERITY_WEIGHT = {
    "CRITICAL": 90,
    "HIGH": 70,
    "MEDIUM": 45,
    "LOW": 25,
    "INFO": 10,
    "UNKNOWN": 30,
}

CRITICALITY_MULT = {
    "critical": 1.4,
    "high": 1.2,
    "medium": 1.0,
    "low": 0.85,
}

SLA_HOURS_BY_PRIORITY = {
    "urgent": 24,
    "high": 72,
    "medium": 168,
    "low": 336,
}


def _cve_ids(finding: Finding) -> list[str]:
    import json

    try:
        data = json.loads(finding.linked_cve_ids_json or "[]")
    except Exception:
        data = []
    if not isinstance(data, list):
        return []
    return [str(c).upper().strip() for c in data if str(c).strip()]


def max_epss(db: Session, cve_ids: list[str]) -> float:
    if not cve_ids:
        return 0.0
    rows = db.query(EpssScore).filter(EpssScore.cve_id.in_(cve_ids)).all()
    best = 0.0
    for r in rows:
        try:
            best = max(best, float(r.score or 0))
        except (TypeError, ValueError):
            continue
    return best


def any_kev(db: Session, cve_ids: list[str]) -> bool:
    if not cve_ids:
        return False
    row = (
        db.query(CveRecord.id)
        .filter(CveRecord.id.in_(cve_ids), CveRecord.is_cisa_kev.is_(True))
        .first()
    )
    return row is not None


def compute_risk(
    db: Session,
    finding: Finding,
    *,
    asset: Asset | None = None,
) -> tuple[int, str]:
    sev = (finding.severity or "MEDIUM").upper()
    base = SEVERITY_WEIGHT.get(sev, 30)
    cves = _cve_ids(finding)
    epss = max_epss(db, cves)
    kev = any_kev(db, cves)
    score = float(base) * (1.0 + min(1.0, epss))
    if kev:
        score *= 1.35
    if asset is None and finding.asset_id:
        asset = db.get(Asset, finding.asset_id)
    crit = ((asset.criticality if asset else None) or "medium").lower()
    score *= CRITICALITY_MULT.get(crit, 1.0)
    risk = int(max(0, min(100, round(score))))
    if risk >= 85 or kev:
        priority = "urgent"
    elif risk >= 65:
        priority = "high"
    elif risk >= 40:
        priority = "medium"
    else:
        priority = "low"
    return risk, priority


def apply_risk_and_sla(db: Session, finding: Finding, *, asset: Asset | None = None) -> Finding:
    risk, priority = compute_risk(db, finding, asset=asset)
    finding.risk_score = risk
    finding.priority = priority
    hours = SLA_HOURS_BY_PRIORITY.get(priority, 168)
    finding.sla_hours = hours
    if finding.status in ("open", "triaged", "new") and not finding.due_at:
        base = finding.created_at or utcnow()
        finding.due_at = base + timedelta(hours=hours)
    return finding


def recompute_finding(db: Session, finding_id: int) -> dict[str, Any]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise LookupError("Finding not found")
    apply_risk_and_sla(db, finding)
    db.commit()
    db.refresh(finding)
    return {
        "id": finding.id,
        "risk_score": finding.risk_score,
        "priority": finding.priority,
        "due_at": finding.due_at.isoformat() if finding.due_at else None,
        "sla_hours": finding.sla_hours,
    }


def backfill_risk_scores(db: Session, *, limit: int = 100) -> int:
    """Recompute risk for findings still at default risk_score=0 (post-upgrade)."""
    rows = (
        db.query(Finding)
        .filter(
            Finding.risk_score == 0,
            Finding.status.in_(["open", "triaged", "new", "accepted"]),
        )
        .order_by(Finding.id.asc())
        .limit(limit)
        .all()
    )
    n = 0
    for f in rows:
        apply_risk_and_sla(db, f)
        n += 1
    if n:
        db.commit()
    return n


def reopen_expired_acceptances(db: Session, *, limit: int = 50) -> int:
    now = utcnow()
    rows = (
        db.query(Finding)
        .filter(
            Finding.status == "accepted",
            Finding.accepted_until.isnot(None),
            Finding.accepted_until <= now,
        )
        .order_by(Finding.id.asc())
        .limit(limit)
        .all()
    )
    n = 0
    for f in rows:
        f.status = "open"
        f.closed_at = None
        f.accepted_until = None
        apply_risk_and_sla(db, f)
        n += 1
    if n:
        db.commit()
    return n
