"""First-run setup wizard (W10 minimal): org → branding → finish."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db import get_db
from app.models import User
from app.schemas import MessageOut
from app.services.auth_helpers import get_setting, set_setting, write_audit

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupStatusOut(BaseModel):
    completed: bool
    needs_setup: bool
    can_skip: bool
    organization_name: str = ""
    product_name: str = ""
    login_title: str = ""
    login_text: str = ""


class SetupOrgIn(BaseModel):
    organization_name: str = Field(min_length=1, max_length=255)


class SetupBrandingIn(BaseModel):
    product_name: str | None = Field(None, max_length=64)
    login_title: str | None = Field(None, max_length=255)
    login_text: str | None = Field(None, max_length=2000)
    local_id_prefix: str | None = Field(None, max_length=16)


def _is_admin(user: User) -> bool:
    return bool(user.is_super_admin or any(r.code == "admin" for r in user.roles))


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return user


def setup_completed(db: Session) -> bool:
    return get_setting(db, "setup_completed", "false") == "true"


def _status(db: Session) -> SetupStatusOut:
    completed = setup_completed(db)
    settings = get_settings()
    org = get_setting(db, "brand_organization_name", "") or (settings.vbx_admin_org or "")
    # Skip forcing wizard when admin was seeded with org (RED OS / .env install)
    can_skip = completed or bool((settings.vbx_admin_org or "").strip()) or bool(org.strip())
    needs_setup = not completed and not can_skip
    return SetupStatusOut(
        completed=completed,
        needs_setup=needs_setup,
        can_skip=can_skip or completed,
        organization_name=org,
        product_name=get_setting(db, "brand_product_name", "VBX") or "VBX",
        login_title=get_setting(db, "brand_login_title", "") or "Корпоративная база уязвимостей",
        login_text=get_setting(db, "brand_login_text", "")
        or "NVD · БДУ ФСТЭК · CISA KEV · EPSS · заявки.",
    )


@router.get("/status", response_model=SetupStatusOut)
def get_setup_status(db: Session = Depends(get_db)) -> SetupStatusOut:
    """Public-ish: used by web to decide redirect (no secrets)."""
    return _status(db)


@router.put("/organization", response_model=MessageOut)
def setup_organization(
    payload: SetupOrgIn,
    db: Session = Depends(get_db),
    user: User = Depends(_require_admin),
) -> MessageOut:
    if setup_completed(db):
        raise HTTPException(status_code=400, detail="Мастер уже завершён")
    set_setting(db, "brand_organization_name", payload.organization_name.strip())
    write_audit(db, action="setup.organization", actor_user_id=user.id, resource="setup")
    return MessageOut(message="Организация сохранена")


@router.put("/branding", response_model=MessageOut)
def setup_branding(
    payload: SetupBrandingIn,
    db: Session = Depends(get_db),
    user: User = Depends(_require_admin),
) -> MessageOut:
    if setup_completed(db):
        raise HTTPException(status_code=400, detail="Мастер уже завершён")
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "product_name": "brand_product_name",
        "login_title": "brand_login_title",
        "login_text": "brand_login_text",
        "local_id_prefix": "local_id_prefix",
    }
    for field, key in mapping.items():
        if field in data and data[field] is not None:
            val = str(data[field]).strip()
            if field == "local_id_prefix":
                val = val.upper()[:16] or "VBX"
            set_setting(db, key, val)
    write_audit(db, action="setup.branding", actor_user_id=user.id, resource="setup")
    return MessageOut(message="Брендинг сохранён")


@router.post("/finish", response_model=MessageOut)
def setup_finish(
    db: Session = Depends(get_db),
    user: User = Depends(_require_admin),
) -> MessageOut:
    set_setting(db, "setup_completed", "true")
    write_audit(db, action="setup.finish", actor_user_id=user.id, resource="setup")
    return MessageOut(message="Настройка завершена")


@router.post("/skip", response_model=MessageOut)
def setup_skip(
    db: Session = Depends(get_db),
    user: User = Depends(_require_admin),
) -> MessageOut:
    set_setting(db, "setup_completed", "true")
    write_audit(db, action="setup.skip", actor_user_id=user.id, resource="setup")
    return MessageOut(message="Мастер пропущен")
