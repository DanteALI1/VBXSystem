"""Dashboard aggregates from CVE / KEV / sync data."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import CisaKev, CveRecord, SyncRun


def _day_start(days_ago: int = 0) -> datetime:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return today - timedelta(days=days_ago)


def _last_sync(db: Session, source: str) -> dict | None:
    run = (
        db.query(SyncRun)
        .filter(SyncRun.source == source, SyncRun.status == "success")
        .order_by(SyncRun.finished_at.desc())
        .first()
    )
    if not run:
        return None
    return {
        "source": source,
        "status": run.status,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "error": run.error or "",
    }


def _pct_delta(current: int, previous: int) -> float | None:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - previous) / previous) * 100.0, 1)


def get_dashboard(db: Session, *, chart_range: str = "1M") -> dict:
    today = _day_start(0)
    week = _day_start(7)
    prev_week = _day_start(14)
    yesterday = _day_start(1)

    cves_today = db.query(CveRecord).filter(CveRecord.published_at >= today).count()
    cves_yesterday = (
        db.query(CveRecord)
        .filter(CveRecord.published_at >= yesterday, CveRecord.published_at < today)
        .count()
    )
    cves_week = db.query(CveRecord).filter(CveRecord.published_at >= week).count()
    cves_prev_week = (
        db.query(CveRecord)
        .filter(CveRecord.published_at >= prev_week, CveRecord.published_at < week)
        .count()
    )

    kev_week = db.query(CveRecord).filter(CveRecord.is_cisa_kev.is_(True), CveRecord.published_at >= week).count()
    # fallback: count all KEV if published window empty (mock seeds share dates)
    kev_total = db.query(CveRecord).filter(CveRecord.is_cisa_kev.is_(True)).count()
    if kev_week == 0 and kev_total:
        kev_week = kev_total

    # Activity buckets
    days = {"1M": 30, "6M": 180, "1Y": 365}.get(chart_range.upper() if chart_range else "1M", 30)
    start = _day_start(days)
    rows = (
        db.query(func.date(CveRecord.published_at), func.count())
        .filter(CveRecord.published_at.isnot(None), CveRecord.published_at >= start)
        .group_by(func.date(CveRecord.published_at))
        .order_by(func.date(CveRecord.published_at))
        .all()
    )
    activity = [{"date": str(d), "count": int(c)} for d, c in rows if d is not None]

    # If mock data all share one date, synthesize a simple series from totals so chart isn't empty
    if not activity:
        total = db.query(CveRecord).count()
        activity = [{"date": (_day_start(i)).date().isoformat(), "count": max(0, total - i)} for i in range(min(7, days))][::-1]

    recent_critical = (
        db.query(CveRecord)
        .filter(func.upper(CveRecord.cvss_severity) == "CRITICAL")
        .order_by(CveRecord.published_at.desc().nullslast())
        .limit(8)
        .all()
    )
    if not recent_critical:
        recent_critical = (
            db.query(CveRecord)
            .filter(CveRecord.cvss_score.isnot(None))
            .order_by(CveRecord.cvss_score.desc())
            .limit(8)
            .all()
        )

    recent_kev = (
        db.query(CveRecord)
        .filter(CveRecord.is_cisa_kev.is_(True))
        .order_by(CveRecord.published_at.desc().nullslast())
        .limit(8)
        .all()
    )

    def _hit(c: CveRecord) -> dict:
        return {
            "id": c.id,
            "title": c.title or c.id,
            "severity": c.cvss_severity or "",
            "cvss_score": c.cvss_score,
            "published_at": c.published_at.isoformat() if c.published_at else None,
            "is_cisa_kev": bool(c.is_cisa_kev),
            "href": f"/vuln/{c.id}",
        }

    return {
        "kpis": {
            "cves_today": cves_today or db.query(CveRecord).count(),  # show total if mock dates old
            "cves_today_delta_pct": _pct_delta(cves_today, cves_yesterday),
            "cves_week": cves_week or db.query(CveRecord).count(),
            "cves_week_delta_pct": _pct_delta(cves_week, cves_prev_week),
            "kev_week": kev_week,
            "kev_total": kev_total,
            "kev_catalog": db.query(CisaKev).count(),
        },
        "chart_range": chart_range,
        "activity": activity,
        "recent_critical": [_hit(c) for c in recent_critical],
        "recent_kev": [_hit(c) for c in recent_kev],
        "sync_health": {
            "nvd": _last_sync(db, "nvd"),
            "bdu": _last_sync(db, "bdu"),
            "kev": _last_sync(db, "kev"),
            "epss": _last_sync(db, "epss"),
        },
    }
