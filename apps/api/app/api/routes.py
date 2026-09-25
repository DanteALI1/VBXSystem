"""Liveness / readiness / sync metrics."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import check_db, get_db
from app.models import SyncRun
from app.schemas import HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
def ready() -> ReadyResponse:
    db_ok = check_db()
    redis_ok = False
    try:
        import redis
        from app.core.config import get_settings

        settings = get_settings()
        client = redis.from_url(settings.vbx_redis_url)
        redis_ok = client.ping() is True
    except Exception:
        redis_ok = False

    status_val = "ok" if db_ok and redis_ok else "degraded"
    return ReadyResponse(status=status_val, database=db_ok, redis=redis_ok)


def _duration_seconds(run: SyncRun) -> float | None:
    if not run.started_at or not run.finished_at:
        return None
    try:
        return round((run.finished_at - run.started_at).total_seconds(), 3)
    except Exception:
        return None


@router.get("/metrics")
def metrics(db: Session = Depends(get_db)) -> dict:
    """Lightweight sync + scan observability (no auth — for probes)."""
    sources = ("nvd", "kev", "bdu", "epss")
    last_by_source: dict[str, dict | None] = {}
    for source in sources:
        run = (
            db.query(SyncRun)
            .filter(SyncRun.source == source)
            .order_by(SyncRun.id.desc())
            .first()
        )
        if not run:
            last_by_source[source] = None
            continue
        last_by_source[source] = {
            "id": run.id,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "duration_sec": _duration_seconds(run),
            "error": (run.error or "")[:500],
        }
    from app.services import modules as module_svc

    return {
        "status": "ok",
        "sync": last_by_source,
        "scan": module_svc.get_scan_stats(db),
    }
