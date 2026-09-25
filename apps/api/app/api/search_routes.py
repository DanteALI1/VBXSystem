"""Search, CVE/BDU detail, CSV export."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import BduDetailOut, CveDetailOut, SearchResponse
from app.services.csv_export import dicts_to_csv
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


@router.get("/search/export")
def search_export_csv(
    q: str = Query(""),
    severity: str | None = Query(None),
    kev: bool = Query(False, alias="kev"),
    has_bdu: bool = Query(False),
    date_preset: str | None = Query(None),
    sort: str = Query("published"),
    limit: int = Query(2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    results: list[dict] = []
    total = None
    page = 1
    while len(results) < limit:
        chunk = search_vulnerabilities(
            db,
            q=q,
            severity=severity,
            kev_only=kev,
            has_bdu=has_bdu,
            date_preset=date_preset,
            sort=sort,
            page=page,
            page_size=100,
        )
        if total is None:
            total = int(chunk.get("total") or 0)
        batch = chunk.get("results") or []
        if not batch:
            break
        results.extend(batch)
        if len(results) >= total:
            break
        page += 1
        if page > 60:
            break
    results = results[:limit]
    headers = (
        "kind",
        "id",
        "title",
        "severity",
        "cvss_score",
        "published_at",
        "is_cisa_kev",
        "has_bdu",
        "epss_score",
        "href",
    )
    rows = []
    for r in results:
        epss = r.get("epss") or {}
        rows.append(
            {
                "kind": r.get("kind"),
                "id": r.get("id"),
                "title": r.get("title"),
                "severity": r.get("severity"),
                "cvss_score": r.get("cvss_score"),
                "published_at": r.get("published_at"),
                "is_cisa_kev": r.get("is_cisa_kev"),
                "has_bdu": r.get("has_bdu"),
                "epss_score": epss.get("score") if isinstance(epss, dict) else None,
                "href": r.get("href"),
            }
        )
    csv_text = dicts_to_csv(headers, rows)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="search-export.csv"'},
    )


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
    data = get_bdu_detail(db, bdu_id)
    if not data:
        raise HTTPException(status_code=404, detail="Запись БДУ не найдена")
    return BduDetailOut(**data)
