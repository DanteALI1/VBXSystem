from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db import get_db
from app.models import ApiKey, User
from app.schemas import ApiKeyCreatedOut, ApiKeyOut, MessageOut
from app.services.api_keys import create_api_key, key_scopes, list_api_keys, revoke_api_key
from app.services.auth_helpers import write_audit

router = APIRouter(prefix="/settings/api-keys", tags=["settings-api-keys"])


class ApiKeyCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    scopes: list[str] = Field(default_factory=lambda: ["vuln:read"])
    expires_days: int | None = Field(90, ge=0, le=3650)


def _out(row: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        scopes=key_scopes(row),
        expires_at=row.expires_at,
        revoked_at=row.revoked_at,
        last_used_at=row.last_used_at,
        created_at=row.created_at,
    )


@router.get("", response_model=list[ApiKeyOut])
def list_keys(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("api_keys:manage")),
) -> list[ApiKeyOut]:
    # super admin sees all; others — own
    owner = None if user.is_super_admin else user.id
    return [_out(r) for r in list_api_keys(db, owner_user_id=owner)]


@router.post("", response_model=ApiKeyCreatedOut)
def create_key(
    payload: ApiKeyCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("api_keys:manage")),
) -> ApiKeyCreatedOut:
    allowed = {"vuln:read", "vuln:sync", "settings:read", "tickets:read"}
    scopes = [s for s in payload.scopes if s in allowed]
    if not scopes:
        raise HTTPException(status_code=400, detail="Укажите хотя бы один допустимый scope")
    row, secret = create_api_key(
        db,
        owner_user_id=user.id,
        name=payload.name,
        scopes=scopes,
        expires_days=payload.expires_days,
    )
    write_audit(db, action="api_keys.create", actor_user_id=user.id, resource=f"key:{row.id}")
    return ApiKeyCreatedOut(**_out(row).model_dump(), secret=secret)


@router.post("/{key_id}/revoke", response_model=MessageOut)
def revoke_key(
    key_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("api_keys:manage")),
) -> MessageOut:
    owner = None if user.is_super_admin else user.id
    row = revoke_api_key(db, key_id, owner_user_id=owner)
    if not row:
        raise HTTPException(status_code=404, detail="Ключ не найден")
    write_audit(db, action="api_keys.revoke", actor_user_id=user.id, resource=f"key:{key_id}")
    return MessageOut(message="Ключ отозван")
