"""Org watchlist CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions, user_permissions
from app.db import get_db
from app.models import User
from app.schemas import MessageOut
from app.services import watchlist as wl

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


class WatchlistCreate(BaseModel):
    kind: str = Field(min_length=2, max_length=32)
    value: str = Field(min_length=1, max_length=512)


class WatchlistOut(BaseModel):
    id: int
    org_key: str = ""
    user_id: int | None = None
    kind: str
    value: str
    created_by: int | None = None
    created_at: str | None = None


def _can_write(user: User) -> bool:
    if user.is_super_admin:
        return True
    perms = user_permissions(user)
    return "*" in perms or "tickets:write" in perms


@router.get("", response_model=list[WatchlistOut])
def get_watchlist(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> list[WatchlistOut]:
    return [WatchlistOut(**wl.entry_to_out(e)) for e in wl.list_entries(db, user)]


@router.post("", response_model=WatchlistOut)
def create_watchlist_entry(
    payload: WatchlistCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WatchlistOut:
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    try:
        entry = wl.add_entry(db, user, kind=payload.kind, value=payload.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return WatchlistOut(**wl.entry_to_out(entry))


@router.delete("/{entry_id}", response_model=MessageOut)
def remove_watchlist_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if not wl.delete_entry(db, user, entry_id):
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return MessageOut(message="Удалено")
