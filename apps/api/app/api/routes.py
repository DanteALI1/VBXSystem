from fastapi import APIRouter

from app.db import check_db
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
