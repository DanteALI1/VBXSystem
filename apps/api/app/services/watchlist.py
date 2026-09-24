"""Org / personal vulnerability watchlist."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import OrgWatchlistEntry, User

VALID_KINDS = {"cve", "vendor", "product"}


def org_key_for(user: User) -> str:
    return (user.organization or "").strip().lower()


def list_entries(db: Session, user: User) -> list[OrgWatchlistEntry]:
    key = org_key_for(user)
    q = db.query(OrgWatchlistEntry)
    if key:
        q = q.filter(OrgWatchlistEntry.org_key == key)
    else:
        q = q.filter(OrgWatchlistEntry.user_id == user.id, OrgWatchlistEntry.org_key == "")
    return q.order_by(OrgWatchlistEntry.id.desc()).all()


def add_entry(db: Session, user: User, *, kind: str, value: str) -> OrgWatchlistEntry:
    kind = (kind or "").strip().lower()
    value = (value or "").strip()
    if kind not in VALID_KINDS:
        raise ValueError("kind должен быть cve, vendor или product")
    if not value:
        raise ValueError("value обязателен")
    if kind == "cve":
        value = value.upper()
    key = org_key_for(user)
    entry = OrgWatchlistEntry(
        org_key=key,
        user_id=None if key else user.id,
        kind=kind,
        value=value,
        created_by=user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, user: User, entry_id: int) -> bool:
    entry = db.get(OrgWatchlistEntry, entry_id)
    if not entry:
        return False
    key = org_key_for(user)
    if key:
        if entry.org_key != key:
            return False
    else:
        if entry.user_id != user.id:
            return False
    db.delete(entry)
    db.commit()
    return True


def entry_to_out(e: OrgWatchlistEntry) -> dict:
    return {
        "id": e.id,
        "org_key": e.org_key,
        "user_id": e.user_id,
        "kind": e.kind,
        "value": e.value,
        "created_by": e.created_by,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
