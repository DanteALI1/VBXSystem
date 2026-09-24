from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.api.database_routes import _sync_out
from app.db import get_db
from app.models import SyncRun, User
from app.schemas import EpssOverviewOut, SyncStartOut
from app.services.epss_service import get_epss_overview
from app.services.sync_jobs import enqueue_sync

router = APIRouter(prefix="/epss", tags=["epss"])


@router.get("", response_model=EpssOverviewOut)
def epss_overview(
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> EpssOverviewOut:
    return EpssOverviewOut(**get_epss_overview(db, limit=limit))


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
