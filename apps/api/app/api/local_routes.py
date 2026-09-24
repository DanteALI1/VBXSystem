"""Local vulnerability CRUD (W9)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User
from app.services.local_vulns import create_local_vuln, get_local_detail

router = APIRouter(tags=["local-vulns"])


class LocalCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str = ""
    severity: str = "MEDIUM"
    vendor: str = ""
    product_name: str = ""
    remediation: str = ""
    linked_cve_ids: list[str] = Field(default_factory=list)


class LocalDetailOut(BaseModel):
    id: str
    title: str
    description: str = ""
    severity: str = ""
    status: str = ""
    vendor: str = ""
    product_name: str = ""
    remediation: str = ""
    linked_cve_ids: list[str] = []
    created_at: str | None = None
    updated_at: str | None = None


def _can_write(user: User) -> bool:
    if user.is_super_admin:
        return True
    codes = {r.code for r in user.roles}
    return bool(codes & {"admin", "analyst", "ticket_manager"})


@router.post("/local", response_model=LocalDetailOut)
def create_local(
    payload: LocalCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LocalDetailOut:
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    row = create_local_vuln(
        db,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        vendor=payload.vendor,
        product_name=payload.product_name,
        remediation=payload.remediation,
        linked_cve_ids=payload.linked_cve_ids,
        created_by_id=user.id,
    )
    detail = get_local_detail(db, row.id)
    assert detail
    return LocalDetailOut(**detail)


@router.get("/local/{local_id}", response_model=LocalDetailOut)
def local_detail(
    local_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> LocalDetailOut:
    detail = get_local_detail(db, local_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Локальная запись не найдена")
    return LocalDetailOut(**detail)
