from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import NotificationPreference, User, utcnow
from app.schemas import MessageOut, NotificationPrefsOut

router = APIRouter(prefix="/settings/notifications", tags=["settings-notifications"])


class NotificationPrefsUpdate(BaseModel):
    new_vulns: bool | None = None
    kev_updates: bool | None = None
    nvd_sync: bool | None = None
    bdu_import: bool | None = None
    ticket_events: bool | None = None
    channel_toast: bool | None = None
    channel_modal: bool | None = None


def _get_or_create(db: Session, user_id: int) -> NotificationPreference:
    row = db.get(NotificationPreference, user_id)
    if row:
        return row
    row = NotificationPreference(user_id=user_id, updated_at=utcnow())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _out(row: NotificationPreference) -> NotificationPrefsOut:
    return NotificationPrefsOut(
        new_vulns=row.new_vulns,
        kev_updates=row.kev_updates,
        nvd_sync=row.nvd_sync,
        bdu_import=row.bdu_import,
        ticket_events=row.ticket_events,
        channel_toast=row.channel_toast,
        channel_modal=row.channel_modal,
    )


@router.get("", response_model=NotificationPrefsOut)
def get_prefs(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> NotificationPrefsOut:
    return _out(_get_or_create(db, user.id))


@router.put("", response_model=NotificationPrefsOut)
def update_prefs(
    payload: NotificationPrefsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationPrefsOut:
    row = _get_or_create(db, user.id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return _out(row)
