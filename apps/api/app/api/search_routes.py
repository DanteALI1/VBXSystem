from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import BduDetailOut, CveDetailOut, SearchResponse
from app.services.search import get_bdu_detail, get_cve_detail, search_vulnerabilities

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(""),
    severity: str | None = Query(None),
    kev: bool = Query(False, alias="kev"),
    has_bdu: bool = Query(False),
    date_preset: str | None = Query(None),
    sort: str = Query("published"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SearchResponse:
    data = search_vulnerabilities(
        db,
        q=q,
        severity=severity,
        kev_only=kev,
        has_bdu=has_bdu,
        date_preset=date_preset,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return SearchResponse(**data)


@router.get("/vuln/{cve_id}", response_model=CveDetailOut)
def vuln_detail(
    cve_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CveDetailOut:
    data = get_cve_detail(db, cve_id)
    if not data:
        raise HTTPException(status_code=404, detail="CVE не найдена")
    return CveDetailOut(**data)


@router.get("/bdu/{bdu_id:path}", response_model=BduDetailOut)
def bdu_detail(
    bdu_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BduDetailOut:
    # path allows BDU:2024-00001
    data = get_bdu_detail(db, bdu_id)
    if not data:
        raise HTTPException(status_code=404, detail="Запись БДУ не найдена")
    return BduDetailOut(**data)
