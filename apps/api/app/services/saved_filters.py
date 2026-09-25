"""User-saved filter presets (Greenbone-style)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import SavedFilter, User, utcnow


def _out(row: SavedFilter) -> dict[str, Any]:
    try:
        query = json.loads(row.query_json or "{}")
    except json.JSONDecodeError:
        query = {}
    return {
        "id": row.id,
        "scope": row.scope,
        "name": row.name,
        "query": query if isinstance(query, dict) else {},
        "user_id": row.user_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_filters(db: Session, *, user: User, scope: str | None = None) -> list[dict[str, Any]]:
    q = db.query(SavedFilter).filter(SavedFilter.user_id == user.id)
    if scope:
        q = q.filter(SavedFilter.scope == scope.strip())
    return [_out(r) for r in q.order_by(SavedFilter.id.desc()).all()]


def create_filter(
    db: Session,
    *,
    user: User,
    scope: str,
    name: str,
    query: dict | None = None,
) -> dict[str, Any]:
    sc = (scope or "findings").strip()[:64] or "findings"
    nm = (name or "").strip()[:255]
    if not nm:
        raise ValueError("name required")
    row = SavedFilter(
        scope=sc,
        name=nm,
        query_json=json.dumps(query or {}, ensure_ascii=False),
        user_id=user.id,
        created_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


def delete_filter(db: Session, *, user: User, filter_id: int) -> None:
    row = (
        db.query(SavedFilter)
        .filter(SavedFilter.id == filter_id, SavedFilter.user_id == user.id)
        .first()
    )
    if not row:
        raise LookupError("Filter not found")
    db.delete(row)
    db.commit()
