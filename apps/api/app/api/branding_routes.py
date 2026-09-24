"""Public branding + admin branding settings (W9)."""

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

router = APIRouter(tags=["branding"])


class BrandingOut(BaseModel):
    product_name: str
    organization_name: str
    login_title: str
    login_text: str
    local_id_prefix: str
    mark: str = "VBX"


class BrandingUpdate(BaseModel):
    product_name: str | None = Field(None, max_length=64)
    organization_name: str | None = Field(None, max_length=255)
    login_title: str | None = Field(None, max_length=255)
    login_text: str | None = Field(None, max_length=2000)
    local_id_prefix: str | None = Field(None, max_length=16)


def _branding(db: Session) -> BrandingOut:
    settings = get_settings()
    product = get_setting(db, "brand_product_name", "VBX") or "VBX"
    org = get_setting(db, "brand_organization_name", "") or (settings.vbx_admin_org or "")
    title = get_setting(db, "brand_login_title", "") or "Корпоративная база уязвимостей"
    text = get_setting(db, "brand_login_text", "") or (
        "NVD · БДУ ФСТЭК · CISA KEV · EPSS · заявки. Локальное развёртывание для команд ИБ."
    )
    prefix = get_setting(db, "local_id_prefix", "VBX") or "VBX"
    mark = (product[:3] or "VBX").upper()
    return BrandingOut(
        product_name=product,
        organization_name=org,
        login_title=title,
        login_text=text,
        local_id_prefix=prefix.upper()[:16],
        mark=mark,
    )


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if user.is_super_admin or any(r.code == "admin" for r in user.roles):
        return user
    raise HTTPException(status_code=403, detail="Недостаточно прав")


@router.get("/branding", response_model=BrandingOut)
def public_branding(db: Session = Depends(get_db)) -> BrandingOut:
    """Unauthenticated — used by login / register pages."""
    return _branding(db)


@router.get("/settings/branding", response_model=BrandingOut)
def get_branding_settings(
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
) -> BrandingOut:
    return _branding(db)


@router.put("/settings/branding", response_model=MessageOut)
def update_branding(
    payload: BrandingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_admin),
) -> MessageOut:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "product_name": "brand_product_name",
        "organization_name": "brand_organization_name",
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
    write_audit(db, action="branding.update", actor_user_id=user.id, resource="branding")
    return MessageOut(message="Брендинг сохранён")
