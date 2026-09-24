"""Dashboard layout templates (system presets + personal)."""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models import DashboardLayout, User, UserDashboardPrefs, utcnow

CLASSIC_SLUG = "vbx-classic"
CLASSIC_NAME = "VBX Classic"

WIDGET_TYPES = (
    "kpi_cve",
    "kpi_cve_week",
    "kpi_kev",
    "kpi_kev_catalog",
    "kpi_strip",
    "catalog_stats",
    "sync_health",
    "sync_nvd",
    "sync_bdu",
    "activity_chart",
    "attention_feed",
    "attention_compact",
    "list_recent_critical",
    "list_recent_kev",
    "list_epss_top",
    "list_epss_deltas",
    "quick_links",
    "watchlist_cta",
)

CLASSIC_LAYOUT: dict[str, Any] = {
    "version": 1,
    "cols": 12,
    "widgets": [
        {"i": "kpi_cve", "type": "kpi_cve", "x": 0, "y": 0, "w": 4, "h": 2, "minW": 3, "minH": 2},
        {"i": "kpi_kev", "type": "kpi_kev", "x": 4, "y": 0, "w": 4, "h": 2, "minW": 3, "minH": 2},
        {"i": "sync_health", "type": "sync_health", "x": 8, "y": 0, "w": 4, "h": 3, "minW": 3, "minH": 2},
        {"i": "activity_chart", "type": "activity_chart", "x": 0, "y": 3, "w": 12, "h": 3, "minW": 4, "minH": 2},
        {"i": "attention_feed", "type": "attention_feed", "x": 0, "y": 6, "w": 12, "h": 6, "minW": 4, "minH": 3},
    ],
}

ANALYST_LAYOUT: dict[str, Any] = {
    "version": 1,
    "cols": 12,
    "widgets": [
        {"i": "kpi_strip", "type": "kpi_strip", "x": 0, "y": 0, "w": 12, "h": 2, "minW": 6, "minH": 2},
        {"i": "attention_feed", "type": "attention_feed", "x": 0, "y": 2, "w": 8, "h": 7, "minW": 4, "minH": 3},
        {"i": "list_epss_top", "type": "list_epss_top", "x": 8, "y": 2, "w": 4, "h": 4, "minW": 3, "minH": 3},
        {"i": "list_recent_kev", "type": "list_recent_kev", "x": 8, "y": 6, "w": 4, "h": 3, "minW": 3, "minH": 2},
        {"i": "quick_links", "type": "quick_links", "x": 0, "y": 9, "w": 12, "h": 2, "minW": 4, "minH": 2},
    ],
}

OPS_LAYOUT: dict[str, Any] = {
    "version": 1,
    "cols": 12,
    "widgets": [
        {"i": "catalog_stats", "type": "catalog_stats", "x": 0, "y": 0, "w": 6, "h": 2, "minW": 4, "minH": 2},
        {"i": "sync_health", "type": "sync_health", "x": 6, "y": 0, "w": 6, "h": 3, "minW": 3, "minH": 2},
        {"i": "sync_nvd", "type": "sync_nvd", "x": 0, "y": 3, "w": 3, "h": 2, "minW": 2, "minH": 2},
        {"i": "sync_bdu", "type": "sync_bdu", "x": 3, "y": 3, "w": 3, "h": 2, "minW": 2, "minH": 2},
        {"i": "activity_chart", "type": "activity_chart", "x": 6, "y": 3, "w": 6, "h": 3, "minW": 4, "minH": 2},
        {"i": "list_epss_deltas", "type": "list_epss_deltas", "x": 0, "y": 6, "w": 6, "h": 4, "minW": 3, "minH": 3},
        {"i": "list_recent_critical", "type": "list_recent_critical", "x": 6, "y": 6, "w": 6, "h": 4, "minW": 3, "minH": 3},
    ],
}

COMPACT_LAYOUT: dict[str, Any] = {
    "version": 1,
    "cols": 12,
    "widgets": [
        {"i": "kpi_cve", "type": "kpi_cve", "x": 0, "y": 0, "w": 4, "h": 2, "minW": 3, "minH": 2},
        {"i": "kpi_kev", "type": "kpi_kev", "x": 4, "y": 0, "w": 4, "h": 2, "minW": 3, "minH": 2},
        {"i": "kpi_cve_week", "type": "kpi_cve_week", "x": 8, "y": 0, "w": 4, "h": 2, "minW": 3, "minH": 2},
        {"i": "attention_compact", "type": "attention_compact", "x": 0, "y": 2, "w": 8, "h": 5, "minW": 4, "minH": 3},
        {"i": "watchlist_cta", "type": "watchlist_cta", "x": 8, "y": 2, "w": 4, "h": 2, "minW": 3, "minH": 2},
        {"i": "quick_links", "type": "quick_links", "x": 8, "y": 4, "w": 4, "h": 3, "minW": 3, "minH": 2},
    ],
}

SYSTEM_PRESETS: list[tuple[str, str, dict[str, Any]]] = [
    (CLASSIC_SLUG, CLASSIC_NAME, CLASSIC_LAYOUT),
    ("vbx-analyst", "VBX Analyst", ANALYST_LAYOUT),
    ("vbx-ops", "VBX Ops", OPS_LAYOUT),
    ("vbx-compact", "VBX Compact", COMPACT_LAYOUT),
]


def _dumps(layout: dict[str, Any]) -> str:
    return json.dumps(layout, ensure_ascii=False)


def classic_layout_json() -> str:
    return _dumps(CLASSIC_LAYOUT)


def ensure_classic_layout(db: Session) -> DashboardLayout:
    """Ensure all system presets exist; return Classic."""
    classic: DashboardLayout | None = None
    for slug, name, layout in SYSTEM_PRESETS:
        row = (
            db.query(DashboardLayout)
            .filter(DashboardLayout.is_system.is_(True), DashboardLayout.slug == slug)
            .one_or_none()
        )
        if row:
            row.layout_json = _dumps(layout)
            row.name = name
        else:
            row = DashboardLayout(
                user_id=None,
                slug=slug,
                name=name,
                is_system=True,
                layout_json=_dumps(layout),
            )
            db.add(row)
        if slug == CLASSIC_SLUG:
            classic = row
    db.commit()
    if classic:
        db.refresh(classic)
        return classic
    return (
        db.query(DashboardLayout)
        .filter(DashboardLayout.is_system.is_(True), DashboardLayout.slug == CLASSIC_SLUG)
        .one()
    )


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-") or "layout"
    return base[:48]


def _parse_layout(raw: str | dict | None) -> dict[str, Any]:
    if isinstance(raw, dict):
        data = raw
    else:
        try:
            data = json.loads(raw or "{}")
        except json.JSONDecodeError:
            data = {}
    widgets = data.get("widgets") or []
    cleaned = []
    seen: set[str] = set()
    for w in widgets:
        if not isinstance(w, dict):
            continue
        wtype = str(w.get("type") or "")
        if wtype not in WIDGET_TYPES:
            continue
        wid = str(w.get("i") or wtype)
        if wid in seen:
            wid = f"{wtype}-{len(seen)}"
        seen.add(wid)
        cleaned.append(
            {
                "i": wid,
                "type": wtype,
                "x": int(w.get("x") or 0),
                "y": int(w.get("y") or 0),
                "w": max(1, int(w.get("w") or 4)),
                "h": max(1, int(w.get("h") or 2)),
                "minW": int(w.get("minW") or 2),
                "minH": int(w.get("minH") or 2),
            }
        )
    return {"version": 1, "cols": int(data.get("cols") or 12), "widgets": cleaned}


def layout_to_out(row: DashboardLayout) -> dict:
    return {
        "id": row.id,
        "slug": row.slug,
        "name": row.name,
        "is_system": bool(row.is_system),
        "user_id": row.user_id,
        "layout": _parse_layout(row.layout_json),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_layouts(db: Session, user: User) -> list[DashboardLayout]:
    ensure_classic_layout(db)
    return (
        db.query(DashboardLayout)
        .filter(
            (DashboardLayout.is_system.is_(True))
            | (DashboardLayout.user_id == user.id)
        )
        .order_by(DashboardLayout.is_system.desc(), DashboardLayout.name.asc())
        .all()
    )


def get_layout_for_user(db: Session, user: User, layout_id: int) -> DashboardLayout | None:
    row = db.get(DashboardLayout, layout_id)
    if not row:
        return None
    if row.is_system or row.user_id == user.id:
        return row
    return None


def get_active_layout(db: Session, user: User) -> DashboardLayout:
    classic = ensure_classic_layout(db)
    prefs = db.get(UserDashboardPrefs, user.id)
    if prefs and prefs.active_layout_id:
        row = get_layout_for_user(db, user, prefs.active_layout_id)
        if row:
            return row
    return classic


def set_active_layout(db: Session, user: User, layout_id: int) -> DashboardLayout:
    row = get_layout_for_user(db, user, layout_id)
    if not row:
        raise ValueError("Шаблон не найден")
    prefs = db.get(UserDashboardPrefs, user.id)
    if not prefs:
        prefs = UserDashboardPrefs(user_id=user.id, active_layout_id=row.id)
        db.add(prefs)
    else:
        prefs.active_layout_id = row.id
    db.commit()
    return row


def create_personal(
    db: Session,
    user: User,
    *,
    name: str,
    layout: dict | None = None,
    source_id: int | None = None,
) -> DashboardLayout:
    name = (name or "").strip()
    if not name:
        raise ValueError("Название обязательно")
    if layout is not None:
        parsed = _parse_layout(layout)
    elif source_id is not None:
        src = get_layout_for_user(db, user, source_id)
        if not src:
            raise ValueError("Исходный шаблон не найден")
        parsed = _parse_layout(src.layout_json)
    else:
        parsed = _parse_layout(CLASSIC_LAYOUT)

    slug_base = _slugify(name)
    slug = slug_base
    n = 1
    while (
        db.query(DashboardLayout)
        .filter(DashboardLayout.user_id == user.id, DashboardLayout.slug == slug)
        .first()
    ):
        n += 1
        slug = f"{slug_base}-{n}"

    row = DashboardLayout(
        user_id=user.id,
        slug=slug,
        name=name,
        is_system=False,
        layout_json=json.dumps(parsed, ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    set_active_layout(db, user, row.id)
    return row


def update_personal(
    db: Session,
    user: User,
    layout_id: int,
    *,
    name: str | None = None,
    layout: dict | None = None,
) -> DashboardLayout:
    row = db.get(DashboardLayout, layout_id)
    if not row or row.is_system or row.user_id != user.id:
        raise PermissionError("Нельзя изменить системный или чужой шаблон")
    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Название обязательно")
        row.name = name
    if layout is not None:
        row.layout_json = json.dumps(_parse_layout(layout), ensure_ascii=False)
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_personal(db: Session, user: User, layout_id: int) -> None:
    row = db.get(DashboardLayout, layout_id)
    if not row or row.is_system or row.user_id != user.id:
        raise PermissionError("Нельзя удалить системный или чужой шаблон")
    prefs = db.get(UserDashboardPrefs, user.id)
    if prefs and prefs.active_layout_id == row.id:
        prefs.active_layout_id = None
    db.delete(row)
    db.commit()
