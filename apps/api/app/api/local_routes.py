"""Local vulnerability CRUD (W9 + NVD-parity for red team)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User
from app.services.local_vulns import create_local_vuln, get_local_detail, update_local_vuln

router = APIRouter(tags=["local-vulns"])


class LocalCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str = ""
    severity: str = "MEDIUM"
    vendor: str = ""
    product_name: str = ""
    remediation: str = ""
    linked_cve_ids: list[str] = Field(default_factory=list)
    linked_bdu_ids: list[str] = Field(default_factory=list)
    cvss_version: str = ""
    cvss_score: float | None = None
    cvss_severity: str = ""
    cvss_vector: str = ""
    is_remote: bool = False
    cwes: list[str] = Field(default_factory=list)
    products: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    published_at: datetime | None = None
    modified_at: datetime | None = None
    analysis_status: str = ""
    discovery_source: str = ""
    notes: str = ""
    status: str = "open"


class LocalUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: str | None = None
    vendor: str | None = None
    product_name: str | None = None
    remediation: str | None = None
    linked_cve_ids: list[str] | None = None
    linked_bdu_ids: list[str] | None = None
    cvss_version: str | None = None
    cvss_score: float | None = None
    cvss_severity: str | None = None
    cvss_vector: str | None = None
    is_remote: bool | None = None
    cwes: list[str] | None = None
    products: list[str] | None = None
    references: list[str] | None = None
    published_at: datetime | None = None
    modified_at: datetime | None = None
    analysis_status: str | None = None
    discovery_source: str | None = None
    notes: str | None = None
    status: str | None = None


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
    linked_bdu_ids: list[str] = []
    cvss_version: str = ""
    cvss_score: float | None = None
    cvss_severity: str = ""
    cvss_vector: str = ""
    is_remote: bool = False
    cwes: list[str] = []
    products: list[str] = []
    references: list[str] = []
    published_at: str | None = None
    modified_at: str | None = None
    analysis_status: str = ""
    discovery_source: str = ""
    notes: str = ""
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
        linked_bdu_ids=payload.linked_bdu_ids,
        cvss_version=payload.cvss_version,
        cvss_score=payload.cvss_score,
        cvss_severity=payload.cvss_severity,
        cvss_vector=payload.cvss_vector,
        is_remote=payload.is_remote,
        cwes=payload.cwes,
        products=payload.products,
        references=payload.references,
        published_at=payload.published_at,
        modified_at=payload.modified_at,
        analysis_status=payload.analysis_status,
        discovery_source=payload.discovery_source,
        notes=payload.notes,
        status=payload.status,
        created_by_id=user.id,
    )
    detail = get_local_detail(db, row.id)
    assert detail
    return LocalDetailOut(**detail)


@router.patch("/local/{local_id}", response_model=LocalDetailOut)
def patch_local(
    local_id: str,
    payload: LocalUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LocalDetailOut:
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    data = payload.model_dump(exclude_unset=True)
    if "references" in data:
        data["references"] = data.pop("references")
    row = update_local_vuln(db, local_id, actor_user_id=user.id, **data)
    if not row:
        raise HTTPException(status_code=404, detail="Локальная запись не найдена")
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
