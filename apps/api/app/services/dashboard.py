"""Dashboard aggregates from CVE / KEV / EPSS / watchlist."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import BduRecord, CisaKev, CveRecord, EpssScore, LocalVuln, SyncRun, User
from app.services.auth_helpers import get_setting
from app.services import watchlist as wl
from app.services.epss_service import get_epss_overview

ATTENTION_WINDOW_DAYS = 30
KEV_NEW_DAYS = 7
ATTENTION_LIMIT = 12
CRITICAL_SCORE_FLOOR = 9.0
DEFAULT_EPSS_MIN = 0.7


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


def _summary_line(c: CveRecord) -> str:
    title = (c.title or "").strip()
    desc = (c.description or "").strip()
    if title and title.upper() != c.id.upper():
        return title[:180]
    if desc:
        return desc.replace("\n", " ")[:180]
    return c.id


def _parse_kev_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = raw.strip()[:10]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _products_blob(c: CveRecord) -> str:
    try:
        data = json.loads(c.products or "[]")
        if isinstance(data, list):
            return " ".join(str(x) for x in data).lower()
    except json.JSONDecodeError:
        pass
    return (c.products or "").lower()


def _hit(
    c: CveRecord,
    *,
    reason: str,
    kev: CisaKev | None = None,
    epss_score: float | None = None,
) -> dict:
    vendor = ""
    product = ""
    kev_added = None
    if kev:
        vendor = kev.vendor_project or ""
        product = kev.product or ""
        kev_added = kev.date_added or None
    return {
        "id": c.id,
        "title": _summary_line(c),
        "summary": _summary_line(c),
        "severity": c.cvss_severity or "",
        "cvss_score": c.cvss_score,
        "published_at": c.published_at.isoformat() if c.published_at else None,
        "is_cisa_kev": bool(c.is_cisa_kev),
        "reason": reason,
        "vendor": vendor,
        "product": product,
        "kev_date_added": kev_added,
        "epss_score": epss_score,
        "href": f"/vuln/{c.id}",
    }


def _reason_rank(reason: str) -> int:
    order = {"watchlist": 0, "kev_new": 1, "kev": 2, "epss": 3, "critical": 4}
    return order.get(reason, 9)


def _latest_epss_map(db: Session, cve_ids: list[str]) -> dict[str, float]:
    if not cve_ids:
        return {}
    out: dict[str, float] = {}
    for e in (
        db.query(EpssScore)
        .filter(EpssScore.cve_id.in_(cve_ids))
        .order_by(EpssScore.id.desc())
        .all()
    ):
        if e.cve_id not in out:
            out[e.cve_id] = float(e.score)
    return out


def _watchlist_cve_ids(db: Session, user: User | None) -> set[str]:
    if not user:
        return set()
    entries = wl.list_entries(db, user)
    ids: set[str] = set()
    vendor_needles: list[str] = []
    product_needles: list[str] = []
    for e in entries:
        if e.kind == "cve":
            ids.add(e.value.upper())
        elif e.kind == "vendor":
            vendor_needles.append(e.value.lower())
        elif e.kind == "product":
            product_needles.append(e.value.lower())

    if vendor_needles or product_needles:
        kev_rows = db.query(CisaKev).all()
        for k in kev_rows:
            vp = (k.vendor_project or "").lower()
            pr = (k.product or "").lower()
            if any(n in vp for n in vendor_needles) or any(n in pr for n in product_needles):
                ids.add(k.cve_id.upper())
        # Also scan recent high-signal CVEs products JSON (bounded)
        recent = (
            db.query(CveRecord)
            .filter(CveRecord.published_at.isnot(None), CveRecord.published_at >= _day_start(90))
            .order_by(CveRecord.published_at.desc())
            .limit(2000)
            .all()
        )
        for c in recent:
            blob = _products_blob(c)
            if any(n in blob for n in vendor_needles) or any(n in blob for n in product_needles):
                ids.add(c.id.upper())
    return ids


def _attention_feed(
    db: Session,
    *,
    user: User | None = None,
    window_days: int = ATTENTION_WINDOW_DAYS,
) -> list[dict]:
    since = _day_start(window_days)
    kev_new_since = _day_start(KEV_NEW_DAYS)
    try:
        epss_min = float(get_setting(db, "attention_epss_min", str(DEFAULT_EPSS_MIN)))
    except ValueError:
        epss_min = DEFAULT_EPSS_MIN

    watch_ids = _watchlist_cve_ids(db, user)

    window_rows = (
        db.query(CveRecord)
        .filter(
            CveRecord.published_at.isnot(None),
            CveRecord.published_at >= since,
            or_(
                CveRecord.is_cisa_kev.is_(True),
                and_(
                    CveRecord.cvss_score.isnot(None),
                    CveRecord.cvss_score >= CRITICAL_SCORE_FLOOR,
                ),
            ),
        )
        .order_by(CveRecord.published_at.desc().nullslast())
        .limit(250)
        .all()
    )

    # High EPSS in window (join via subquery of latest scores is heavy → filter in Python after pull)
    epss_candidates = (
        db.query(CveRecord)
        .filter(CveRecord.published_at.isnot(None), CveRecord.published_at >= since)
        .order_by(CveRecord.published_at.desc().nullslast())
        .limit(400)
        .all()
    )

    # New KEV by date_added within 7d (may be older published_at)
    kev_catalog = {k.cve_id: k for k in db.query(CisaKev).all()}
    kev_new_ids = {
        cid
        for cid, k in kev_catalog.items()
        if (dt := _parse_kev_date(k.date_added)) is not None and dt >= kev_new_since
    }
    kev_new_rows = []
    if kev_new_ids:
        kev_new_rows = db.query(CveRecord).filter(CveRecord.id.in_(list(kev_new_ids))).all()

    watch_rows = []
    if watch_ids:
        watch_rows = (
            db.query(CveRecord)
            .filter(CveRecord.id.in_(list(watch_ids)))
            .limit(50)
            .all()
        )

    by_id: dict[str, CveRecord] = {}
    for row in window_rows + epss_candidates + kev_new_rows + watch_rows:
        by_id[row.id] = row

    epss_map = _latest_epss_map(db, list(by_id.keys()))

    scored: list[tuple[CveRecord, str, float | None]] = []
    for c in by_id.values():
        epss = epss_map.get(c.id)
        reasons: list[str] = []
        if c.id.upper() in watch_ids:
            reasons.append("watchlist")
        if c.id in kev_new_ids or (c.is_cisa_kev and c.id in kev_new_ids):
            reasons.append("kev_new")
        elif c.is_cisa_kev:
            # also treat recently published KEV as kev_new if published in 7d
            if c.published_at and c.published_at >= kev_new_since:
                reasons.append("kev_new")
            else:
                reasons.append("kev")
        if epss is not None and epss >= epss_min:
            reasons.append("epss")
        if c.cvss_score is not None and c.cvss_score >= CRITICAL_SCORE_FLOOR:
            reasons.append("critical")

        if not reasons:
            continue
        # Best (lowest rank) reason wins for display
        reasons.sort(key=_reason_rank)
        scored.append((c, reasons[0], epss))

    if not scored:
        # Fallback: top KEV + critical globally
        for row in (
            db.query(CveRecord)
            .filter(CveRecord.is_cisa_kev.is_(True))
            .order_by(CveRecord.published_at.desc().nullslast())
            .limit(6)
            .all()
        ):
            scored.append((row, "kev", epss_map.get(row.id)))
        for row in (
            db.query(CveRecord)
            .filter(CveRecord.cvss_score.isnot(None), CveRecord.cvss_score >= CRITICAL_SCORE_FLOOR)
            .order_by(CveRecord.cvss_score.desc(), CveRecord.published_at.desc().nullslast())
            .limit(6)
            .all()
        ):
            if not any(s[0].id == row.id for s in scored):
                scored.append((row, "critical", None))

    scored.sort(
        key=lambda t: (
            _reason_rank(t[1]),
            -(t[2] or 0.0) if t[1] == "epss" else 0,
            -(t[0].cvss_score or 0.0),
            -(t[0].published_at.timestamp() if t[0].published_at else 0.0),
        )
    )
    top = scored[:ATTENTION_LIMIT]
    top_ids = [c.id for c, _, _ in top]
    missing_kev = [i for i in top_ids if i not in kev_catalog]
    if missing_kev:
        for k in db.query(CisaKev).filter(CisaKev.cve_id.in_(missing_kev)).all():
            kev_catalog[k.cve_id] = k

    return [
        _hit(c, reason=reason, kev=kev_catalog.get(c.id), epss_score=epss)
        for c, reason, epss in top
    ]


def get_dashboard(
    db: Session,
    *,
    chart_range: str = "1M",
    user: User | None = None,
) -> dict:
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
    kev_total = db.query(CveRecord).filter(CveRecord.is_cisa_kev.is_(True)).count()
    if kev_week == 0 and kev_total:
        kev_week = kev_total

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

    if not activity:
        total = db.query(CveRecord).count()
        activity = [
            {"date": (_day_start(i)).date().isoformat(), "count": max(0, total - i)}
            for i in range(min(7, days))
        ][::-1]

    try:
        epss_min = float(get_setting(db, "attention_epss_min", str(DEFAULT_EPSS_MIN)))
    except ValueError:
        epss_min = DEFAULT_EPSS_MIN

    attention = _attention_feed(db, user=user, window_days=ATTENTION_WINDOW_DAYS)
    recent_kev = [h for h in attention if h["is_cisa_kev"]][:8]
    recent_critical = [h for h in attention if (h.get("cvss_score") or 0) >= CRITICAL_SCORE_FLOOR][:8]
    if not recent_critical:
        recent_critical = attention[:8]

    epss_overview = get_epss_overview(db, limit=8)
    cve_total = db.query(CveRecord).count()
    bdu_total = db.query(BduRecord).count()
    local_total = db.query(LocalVuln).count()

    return {
        "kpis": {
            "cves_today": cves_today,
            "cves_today_delta_pct": _pct_delta(cves_today, cves_yesterday),
            "cves_week": cves_week,
            "cves_week_delta_pct": _pct_delta(cves_week, cves_prev_week),
            "kev_week": kev_week,
            "kev_total": kev_total,
            "kev_catalog": db.query(CisaKev).count(),
        },
        "catalog_stats": {
            "cve_total": cve_total,
            "bdu_total": bdu_total,
            "local_total": local_total,
            "kev_catalog": db.query(CisaKev).count(),
            "epss_scored": epss_overview.get("total_scored") or 0,
        },
        "chart_range": chart_range,
        "activity": activity,
        "attention_feed": attention,
        "attention_window_days": ATTENTION_WINDOW_DAYS,
        "attention_epss_min": epss_min,
        "recent_critical": recent_critical,
        "recent_kev": recent_kev,
        "epss_top": epss_overview.get("top_predictions") or [],
        "epss_deltas": epss_overview.get("top_deltas") or [],
        "sync_health": {
            "nvd": _last_sync(db, "nvd"),
            "bdu": _last_sync(db, "bdu"),
            "kev": _last_sync(db, "kev"),
            "epss": _last_sync(db, "epss"),
        },
    }
