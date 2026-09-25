"""Scan schedule CRUD + ops-worker tick."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ScanJob, ScanSchedule, User, utcnow
from app.services import module_queue as mq
from app.services import modules as module_svc


def _params(row: ScanSchedule) -> dict:
    try:
        data = json.loads(row.params_json or "{}")
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _out(row: ScanSchedule) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name or "",
        "module_id": row.module_id,
        "params": _params(row),
        "interval_sec": int(row.interval_sec or 3600),
        "enabled": bool(row.enabled),
        "last_run_at": row.last_run_at.isoformat() if row.last_run_at else None,
        "next_run_at": row.next_run_at.isoformat() if row.next_run_at else None,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_schedules(db: Session) -> list[dict[str, Any]]:
    rows = db.query(ScanSchedule).order_by(ScanSchedule.id.desc()).all()
    return [_out(r) for r in rows]


def create_schedule(
    db: Session,
    *,
    actor: User,
    module_id: str,
    params: dict | None = None,
    interval_sec: int = 3600,
    name: str = "",
    enabled: bool = True,
) -> dict[str, Any]:
    mid = (module_id or "").strip()
    if not mid:
        raise ValueError("module_id required")
    interval = max(60, int(interval_sec or 3600))
    now = utcnow()
    row = ScanSchedule(
        name=(name or "").strip()[:255] or f"{mid} every {interval}s",
        module_id=mid,
        params_json=json.dumps(params or {}, ensure_ascii=False),
        interval_sec=interval,
        enabled=bool(enabled),
        last_run_at=None,
        next_run_at=now if enabled else None,
        created_by=actor.id,
        created_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


def update_schedule(
    db: Session,
    schedule_id: int,
    *,
    params: dict | None = None,
    interval_sec: int | None = None,
    name: str | None = None,
    enabled: bool | None = None,
    module_id: str | None = None,
) -> dict[str, Any]:
    row = db.query(ScanSchedule).filter(ScanSchedule.id == schedule_id).first()
    if not row:
        raise LookupError("Schedule not found")
    if module_id is not None:
        mid = module_id.strip()
        if not mid:
            raise ValueError("module_id required")
        row.module_id = mid
    if params is not None:
        row.params_json = json.dumps(params, ensure_ascii=False)
    if interval_sec is not None:
        row.interval_sec = max(60, int(interval_sec))
    if name is not None:
        row.name = name.strip()[:255]
    if enabled is not None:
        row.enabled = bool(enabled)
        if row.enabled and not row.next_run_at:
            row.next_run_at = utcnow()
        if not row.enabled:
            row.next_run_at = None
    db.commit()
    db.refresh(row)
    return _out(row)


def delete_schedule(db: Session, schedule_id: int) -> None:
    row = db.query(ScanSchedule).filter(ScanSchedule.id == schedule_id).first()
    if not row:
        raise LookupError("Schedule not found")
    db.delete(row)
    db.commit()


def tick_due_schedules(db: Session, *, limit: int = 10) -> int:
    """Enqueue ScanJobs for due schedules. Returns count enqueued."""
    now = utcnow()
    due = (
        db.query(ScanSchedule)
        .filter(
            ScanSchedule.enabled.is_(True),
            ScanSchedule.next_run_at.isnot(None),
            ScanSchedule.next_run_at <= now,
        )
        .order_by(ScanSchedule.next_run_at.asc())
        .limit(limit)
        .all()
    )
    n = 0
    for sched in due:
        try:
            disabled = module_svc._disabled_modules(db)
            if sched.module_id in disabled:
                sched.next_run_at = now + timedelta(seconds=int(sched.interval_sec or 3600))
                db.commit()
                continue
            params = _params(sched)
            module_svc._enforce_enqueue_allowlist(db, params)
            job = ScanJob(
                module_id=sched.module_id,
                status="pending",
                kind="scheduled",
                parent_job_id=None,
                created_by=sched.created_by,
                params_json=json.dumps(params, ensure_ascii=False),
                progress_json="{}",
                error="",
                created_at=now,
            )
            db.add(job)
            db.flush()
            mq.enqueue_job(sched.module_id, job.id)
            job.status = "queued"
            sched.last_run_at = now
            sched.next_run_at = now + timedelta(seconds=int(sched.interval_sec or 3600))
            db.commit()
            n += 1
        except Exception:  # noqa: BLE001
            db.rollback()
            # Push next_run to avoid tight failure loop
            try:
                sched = db.query(ScanSchedule).filter(ScanSchedule.id == sched.id).first()
                if sched:
                    sched.next_run_at = now + timedelta(seconds=int(sched.interval_sec or 3600))
                    db.commit()
            except Exception:  # noqa: BLE001
                db.rollback()
    return n
