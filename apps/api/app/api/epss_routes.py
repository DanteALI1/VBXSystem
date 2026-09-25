from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.api.database_routes import _sync_out
from app.db import get_db
from app.models import SyncRun, User
from app.schemas import EpssHistoryOut, EpssOverviewOut, SyncStartOut
from app.services.csv_export import dicts_to_csv
from app.services.epss_service import get_epss_history, get_epss_overview
from app.services.sync_jobs import enqueue_sync

router = APIRouter(prefix="/epss", tags=["epss"])


@router.get("", response_model=EpssOverviewOut)
def epss_overview(
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> EpssOverviewOut:
    return EpssOverviewOut(**get_epss_overview(db, limit=limit))


@router.get("/export")
def epss_export_csv(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    data = get_epss_overview(db, limit=limit)
    headers = (
        "list",
        "cve_id",
        "score",
        "percentile",
        "severity",
        "title",
        "is_cisa_kev",
        "previous_score",
        "delta",
        "scored_at",
    )
    rows = []
    for r in data.get("top_predictions") or []:
        rows.append(
            {
                "list": "top_predictions",
                "cve_id": r.get("cve_id"),
                "score": r.get("score"),
                "percentile": r.get("percentile"),
                "severity": r.get("severity") or "",
                "title": r.get("title") or "",
                "is_cisa_kev": "yes" if r.get("is_cisa_kev") else "",
                "previous_score": r.get("previous_score") if r.get("previous_score") is not None else "",
                "delta": r.get("delta") if r.get("delta") is not None else "",
                "scored_at": r.get("scored_at") or "",
            }
        )
    for r in data.get("top_deltas") or []:
        rows.append(
            {
                "list": "top_deltas",
                "cve_id": r.get("cve_id"),
                "score": r.get("score"),
                "percentile": r.get("percentile"),
                "severity": r.get("severity") or "",
                "title": r.get("title") or "",
                "is_cisa_kev": "yes" if r.get("is_cisa_kev") else "",
                "previous_score": r.get("previous_score") if r.get("previous_score") is not None else "",
                "delta": r.get("delta") if r.get("delta") is not None else "",
                "scored_at": r.get("scored_at") or "",
            }
        )
    csv_text = dicts_to_csv(headers, rows)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="epss-export.csv"'},
    )


@router.get("/{cve_id}/history", response_model=EpssHistoryOut)
def epss_history(
    cve_id: str,
    limit: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> EpssHistoryOut:
    points = get_epss_history(db, cve_id, limit=limit)
    return EpssHistoryOut(cve_id=cve_id.strip().upper(), points=points)


@router.post("/sync", response_model=SyncStartOut)
def epss_sync(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:sync")),
) -> SyncStartOut:
    run = enqueue_sync(db, "epss", created_by=user.id)
    # Enqueue only — worker drains (same pattern as NVD/BDU)
    _ = user
    run = db.get(SyncRun, run.id)
    return SyncStartOut(run=_sync_out(run), message="Синхронизация EPSS поставлена в очередь worker")
