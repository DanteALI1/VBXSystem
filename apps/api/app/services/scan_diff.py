"""Scan job new/fixed/persistent fingerprint diff + retest enqueue."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.models import Finding, ScanJob, User, utcnow
from app.services import module_queue as mq
from app.services import modules as module_svc


def _job_target(params: dict) -> str:
    for key in ("target", "host", "ip", "hostname", "query", "url"):
        val = params.get(key)
        if isinstance(val, str) and val.strip():
            raw = val.strip().lower()
            if "://" in raw:
                try:
                    host = urlparse(raw).hostname or raw
                    return host
                except Exception:  # noqa: BLE001
                    return raw
            return raw
    return ""


def _fingerprints_for_job(db: Session, job_id: int) -> dict[str, Finding]:
    rows = (
        db.query(Finding)
        .filter(Finding.scan_job_id == job_id, Finding.fingerprint != "")
        .all()
    )
    out: dict[str, Finding] = {}
    for f in rows:
        fp = (f.fingerprint or "").strip()
        if fp and fp not in out:
            out[fp] = f
    return out


def previous_comparable_job(db: Session, job: ScanJob) -> ScanJob | None:
    params = module_svc._json_loads(job.params_json, {})
    target = _job_target(params if isinstance(params, dict) else {})
    q = (
        db.query(ScanJob)
        .filter(
            ScanJob.module_id == job.module_id,
            ScanJob.id < job.id,
            ScanJob.status.in_(["success", "succeeded", "completed", "done"]),
        )
        .order_by(ScanJob.id.desc())
    )
    for cand in q.limit(40).all():
        cparams = module_svc._json_loads(cand.params_json, {})
        if not target:
            return cand
        if _job_target(cparams if isinstance(cparams, dict) else {}) == target:
            return cand
    return None


def job_diff(db: Session, job_id: int) -> dict[str, Any]:
    job = module_svc.get_job(db, job_id)
    current = _fingerprints_for_job(db, job.id)
    prev = previous_comparable_job(db, job)
    if not prev:
        return {
            "job_id": job.id,
            "previous_job_id": None,
            "new": [module_svc._finding_out(f) for f in current.values()],
            "fixed": [],
            "persistent": [],
            "summary": {
                "new": len(current),
                "fixed": 0,
                "persistent": 0,
            },
        }
    older = _fingerprints_for_job(db, prev.id)
    new_fps = set(current) - set(older)
    fixed_fps = set(older) - set(current)
    persistent_fps = set(current) & set(older)
    return {
        "job_id": job.id,
        "previous_job_id": prev.id,
        "new": [module_svc._finding_out(current[fp]) for fp in sorted(new_fps)],
        "fixed": [module_svc._finding_out(older[fp]) for fp in sorted(fixed_fps)],
        "persistent": [module_svc._finding_out(current[fp]) for fp in sorted(persistent_fps)],
        "summary": {
            "new": len(new_fps),
            "fixed": len(fixed_fps),
            "persistent": len(persistent_fps),
        },
    }


def job_summary(db: Session, job_id: int) -> dict[str, Any]:
    job = module_svc.get_job(db, job_id)
    findings = db.query(Finding).filter(Finding.scan_job_id == job_id).all()
    by_sev: dict[str, int] = {}
    hosts: set[str] = set()
    for f in findings:
        sev = (f.severity or "UNKNOWN").upper()
        by_sev[sev] = by_sev.get(sev, 0) + 1
        ev = module_svc._json_loads(f.evidence_json, {})
        if isinstance(ev, dict):
            for k in ("hostname", "host", "ip"):
                v = ev.get(k)
                if isinstance(v, str) and v.strip():
                    hosts.add(v.strip())
        if f.asset_id:
            hosts.add(f"asset:{f.asset_id}")
    duration_sec = None
    if job.started_at and job.finished_at:
        duration_sec = max(0, int((job.finished_at - job.started_at).total_seconds()))
    return {
        "job": module_svc._job_out(job),
        "findings_total": len(findings),
        "by_severity": by_sev,
        "hosts_count": len(hosts),
        "duration_sec": duration_sec,
    }


def retest_job(db: Session, job_id: int, *, actor: User) -> ScanJob:
    parent = module_svc.get_job(db, job_id)
    params = module_svc._json_loads(parent.params_json, {})
    if not isinstance(params, dict):
        params = {}
    module_svc._enforce_enqueue_allowlist(db, params)
    job = ScanJob(
        module_id=parent.module_id,
        status="pending",
        kind="retest",
        parent_job_id=parent.id,
        created_by=actor.id,
        params_json=json.dumps(params, ensure_ascii=False),
        progress_json="{}",
        error="",
        created_at=utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    mq.enqueue_job(job.module_id, job.id)
    job.status = "queued"
    db.commit()
    db.refresh(job)
    return job


def retest_finding(db: Session, finding_id: int, *, actor: User) -> ScanJob:
    finding = module_svc.get_finding(db, finding_id)
    return retest_job(db, finding.scan_job_id, actor=actor)
