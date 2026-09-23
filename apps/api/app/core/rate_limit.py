from fastapi import HTTPException, Request, status

from app.core.config import get_settings


def _redis():
    import redis

    return redis.from_url(get_settings().vbx_redis_url)


def rate_limit(request: Request, key: str, limit: int = 20, window: int = 60) -> None:
    """Simple fixed-window rate limit. Fail-open if Redis unavailable."""
    client_ip = request.client.host if request.client else "unknown"
    redis_key = f"rl:{key}:{client_ip}"
    try:
        r = _redis()
        count = r.incr(redis_key)
        if count == 1:
            r.expire(redis_key, window)
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком много попыток. Попробуйте позже.",
            )
    except HTTPException:
        raise
    except Exception:
        return
