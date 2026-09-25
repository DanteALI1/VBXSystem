"""Redis helpers for scanner module job queues and presence.

Keys:
  vbx:scan:{module_id}  — list of pending job ids (LPUSH / RPOP)
  vbx:module:{id}       — presence JSON with TTL
  vbx:scan:metrics:*    — observability counters (INCR / GET)

Fail-open with an in-process fallback so tests and Redis outages still work.
"""

from __future__ import annotations

import json
import threading
import time
from typing import Any

from app.core.config import get_settings

PRESENCE_TTL_SEC = 90

# Metric key suffixes (prefixed with vbx:scan:metrics:)
METRIC_STALE_LEASES = "stale_leases_reclaimed"
METRIC_FINDINGS_CREATED = "findings_created"
METRIC_ALLOWLIST_ENQUEUE = "allowlist_denials_enqueue"
METRIC_ALLOWLIST_INGEST = "allowlist_denials_ingest"
METRIC_JOBS_CANCELLED = "jobs_cancelled"
METRIC_CLAIM_WAIT_SUM_MS = "claim_wait_sum_ms"
METRIC_CLAIM_WAIT_COUNT = "claim_wait_count"
METRIC_CLAIM_WAIT_LAST_MS = "claim_wait_last_ms"
METRIC_CLAIM_LATENCY_SUM_MS = "claim_latency_sum_ms"
METRIC_CLAIM_LATENCY_COUNT = "claim_latency_count"
METRIC_CLAIM_LATENCY_LAST_MS = "claim_latency_last_ms"

_METRIC_KEYS = (
    METRIC_STALE_LEASES,
    METRIC_FINDINGS_CREATED,
    METRIC_ALLOWLIST_ENQUEUE,
    METRIC_ALLOWLIST_INGEST,
    METRIC_JOBS_CANCELLED,
    METRIC_CLAIM_WAIT_SUM_MS,
    METRIC_CLAIM_WAIT_COUNT,
    METRIC_CLAIM_WAIT_LAST_MS,
    METRIC_CLAIM_LATENCY_SUM_MS,
    METRIC_CLAIM_LATENCY_COUNT,
    METRIC_CLAIM_LATENCY_LAST_MS,
)

_lock = threading.Lock()
_queues: dict[str, list[str]] = {}
_presence: dict[str, tuple[float, str]] = {}  # key -> (expires_monotonic, json)
_counters: dict[str, int] = {}


def queue_key(module_id: str) -> str:
    return f"vbx:scan:{module_id}"


def presence_key(module_id: str) -> str:
    return f"vbx:module:{module_id}"


def metrics_key(name: str) -> str:
    return f"vbx:scan:metrics:{name}"


def _redis():
    import redis

    return redis.from_url(
        get_settings().vbx_redis_url,
        socket_connect_timeout=0.4,
        socket_timeout=0.4,
    )


def enqueue_job(module_id: str, job_id: int) -> None:
    key = queue_key(module_id)
    payload = str(int(job_id))
    try:
        _redis().lpush(key, payload)
        return
    except Exception:
        pass
    with _lock:
        _queues.setdefault(key, []).insert(0, payload)


def remove_job(module_id: str, job_id: int) -> int:
    """Remove job id from the module queue (best-effort). Returns removals count."""
    key = queue_key(module_id)
    payload = str(int(job_id))
    try:
        return int(_redis().lrem(key, 0, payload) or 0)
    except Exception:
        pass
    with _lock:
        q = _queues.get(key) or []
        before = len(q)
        _queues[key] = [x for x in q if x != payload]
        return before - len(_queues[key])


def claim_job_id(module_id: str) -> int | None:
    key = queue_key(module_id)
    try:
        raw = _redis().rpop(key)
    except Exception:
        raw = None
    else:
        if raw is not None:
            return int(raw if isinstance(raw, str) else raw.decode("utf-8"))
        return None
    with _lock:
        q = _queues.get(key) or []
        if not q:
            return None
        return int(q.pop())


def set_presence(module_id: str, data: dict[str, Any], ttl_seconds: int = PRESENCE_TTL_SEC) -> None:
    key = presence_key(module_id)
    payload = json.dumps(data, default=str)
    ttl = max(1, ttl_seconds)
    try:
        _redis().setex(key, ttl, payload)
        return
    except Exception:
        pass
    with _lock:
        _presence[key] = (time.monotonic() + ttl, payload)


def get_presence(module_id: str) -> dict[str, Any] | None:
    key = presence_key(module_id)
    try:
        raw = _redis().get(key)
        if raw is not None:
            text = raw if isinstance(raw, str) else raw.decode("utf-8")
            return json.loads(text)
    except Exception:
        pass
    now = time.monotonic()
    with _lock:
        hit = _presence.get(key)
        if not hit:
            return None
        exp, payload = hit
        if exp <= now:
            _presence.pop(key, None)
            return None
        return json.loads(payload)


def list_online_module_ids() -> set[str]:
    """Best-effort: Redis SCAN + local presence keys."""
    online: set[str] = set()
    prefix = "vbx:module:"
    try:
        r = _redis()
        for key in r.scan_iter(match=f"{prefix}*", count=100):
            k = key if isinstance(key, str) else key.decode("utf-8")
            mid = k[len(prefix) :]
            if mid:
                online.add(mid)
    except Exception:
        pass
    now = time.monotonic()
    with _lock:
        for key, (exp, _) in list(_presence.items()):
            if exp <= now:
                _presence.pop(key, None)
                continue
            if key.startswith(prefix):
                online.add(key[len(prefix) :])
    return online


def incr_metric(name: str, amount: int = 1) -> int:
    """Increment a named counter; returns new value (or amount on Redis failure)."""
    amount = int(amount)
    if amount == 0:
        return get_metric(name)
    key = metrics_key(name)
    try:
        return int(_redis().incrby(key, amount))
    except Exception:
        pass
    with _lock:
        _counters[key] = int(_counters.get(key) or 0) + amount
        return _counters[key]


def set_metric(name: str, value: int) -> None:
    key = metrics_key(name)
    value = int(value)
    try:
        _redis().set(key, value)
        return
    except Exception:
        pass
    with _lock:
        _counters[key] = value


def get_metric(name: str) -> int:
    key = metrics_key(name)
    try:
        raw = _redis().get(key)
        if raw is not None:
            return int(raw if isinstance(raw, str) else raw.decode("utf-8"))
        return 0
    except Exception:
        pass
    with _lock:
        return int(_counters.get(key) or 0)


def record_claim_wait_ms(wait_ms: float) -> None:
    """Track queue wait (enqueue → claim) for avg / last."""
    ms = max(0, int(round(wait_ms)))
    incr_metric(METRIC_CLAIM_WAIT_SUM_MS, ms)
    incr_metric(METRIC_CLAIM_WAIT_COUNT, 1)
    set_metric(METRIC_CLAIM_WAIT_LAST_MS, ms)


def record_claim_latency_ms(latency_ms: float) -> None:
    """Track claim handler duration (optional latency histogram substitute)."""
    ms = max(0, int(round(latency_ms)))
    incr_metric(METRIC_CLAIM_LATENCY_SUM_MS, ms)
    incr_metric(METRIC_CLAIM_LATENCY_COUNT, 1)
    set_metric(METRIC_CLAIM_LATENCY_LAST_MS, ms)


def get_all_metrics() -> dict[str, int]:
    return {name: get_metric(name) for name in _METRIC_KEYS}


def clear_local_state() -> None:
    """Test helper."""
    with _lock:
        _queues.clear()
        _presence.clear()
        _counters.clear()
