"""Server-side saved search views (filters + columns) in system_settings JSON."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import MessageOut
from app.services.auth_helpers import get_setting, set_setting

router = APIRouter(prefix="/search/views", tags=["search-views"])


def _key(user_id: int) -> str:
    return f"user.{user_id}.search_views"


class SavedViewIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    query: str = Field(default="", max_length=2000)
    filters: list = Field(default_factory=list)
    columns: dict | list = Field(default_factory=dict)


class SavedViewOut(BaseModel):
    id: str
    name: str
    query: str = ""
    filters: list = []
    columns: dict | list = {}


def _load(db: Session, user_id: int) -> list[dict]:
    raw = get_setting(db, _key(user_id), "[]")
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _save(db: Session, user_id: int, views: list[dict]) -> None:
    set_setting(db, _key(user_id), json.dumps(views, ensure_ascii=False)[:100_000])


@router.get("", response_model=list[SavedViewOut])
def list_views(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedViewOut]:
    return [SavedViewOut(**v) for v in _load(db, user.id) if isinstance(v, dict) and v.get("id")]


@router.put("", response_model=list[SavedViewOut])
def replace_views(
    views: list[SavedViewIn],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedViewOut]:
    if len(views) > 40:
        raise HTTPException(status_code=400, detail="Не более 40 сохранённых представлений")
    out: list[dict] = []
    for i, v in enumerate(views):
        out.append(
            {
                "id": f"sv_{user.id}_{i}_{abs(hash(v.name)) % 10_000_000}",
                "name": v.name.strip()[:80],
                "query": v.query or "",
                "filters": v.filters if isinstance(v.filters, list) else [],
                "columns": v.columns,
            }
        )
    _save(db, user.id, out)
    return [SavedViewOut(**x) for x in out]


@router.post("", response_model=SavedViewOut)
def upsert_view(
    body: SavedViewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedViewOut:
    views = _load(db, user.id)
    name = body.name.strip()[:80]
    existing = next((v for v in views if str(v.get("name", "")).lower() == name.lower()), None)
    if existing:
        existing["query"] = body.query or ""
        existing["filters"] = body.filters if isinstance(body.filters, list) else []
        existing["columns"] = body.columns
        _save(db, user.id, views)
        return SavedViewOut(**existing)
    if len(views) >= 40:
        raise HTTPException(status_code=400, detail="Не более 40 сохранённых представлений")
    entry = {
        "id": f"sv_{user.id}_{len(views)}_{abs(hash(name)) % 10_000_000}",
        "name": name,
        "query": body.query or "",
        "filters": body.filters if isinstance(body.filters, list) else [],
        "columns": body.columns,
    }
    views.append(entry)
    _save(db, user.id, views)
    return SavedViewOut(**entry)


@router.delete("/{view_id}", response_model=MessageOut)
def delete_view(
    view_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    views = _load(db, user.id)
    next_views = [v for v in views if v.get("id") != view_id]
    if len(next_views) == len(views):
        raise HTTPException(status_code=404, detail="Представление не найдено")
    _save(db, user.id, next_views)
    return MessageOut(message="Удалено")
