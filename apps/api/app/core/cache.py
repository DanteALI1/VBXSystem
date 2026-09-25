"""Short TTL cache: Redis preferred, in-process fallback. Fail-open."""

from __future__ import annotations

import json
import threading
import time
from typing import Any

from app.core.config import get_settings

_lock = threading.Lock()
_local: dict[str, tuple[float, str]] = {}  # key -> (expires_monotonic, json)


def cache_enabled() -> bool:
    """Skip caching for sqlite test DBs so fixtures stay isolated."""
    url = (get_settings().vbx_database_url or "").lower()
    return "sqlite" not in url


def _redis():
    import redis

    return redis.from_url(
        get_settings().vbx_redis_url,
        socket_connect_timeout=0.4,
        socket_timeout=0.4,
    )


def cache_get(key: str) -> Any | None:
    if not cache_enabled():
        return None
    try:
        raw = _redis().get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception:
        pass
    now = time.monotonic()
    with _lock:
        hit = _local.get(key)
        if not hit:
            return None
        exp, payload = hit
        if exp <= now:
            _local.pop(key, None)
            return None
        return json.loads(payload)


def cache_set(key: str, value: Any, ttl_seconds: int = 45) -> None:
    if not cache_enabled():
        return
    payload = json.dumps(value, default=str)
    try:
        _redis().setex(key, max(1, ttl_seconds), payload)
    except Exception:
        pass
    with _lock:
        _local[key] = (time.monotonic() + max(1, ttl_seconds), payload)
        if len(_local) > 256:
            now = time.monotonic()
            for k, (exp, _) in list(_local.items()):
                if exp <= now:
                    _local.pop(k, None)
