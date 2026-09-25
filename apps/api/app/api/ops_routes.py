"""Ops routes: schedules, saved filters, job diff/retest, finding lifecycle, alerts."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db import get_db
from app.models import User
from app.schemas import (
    AlertOutboxOut,
    AlertTestIn,
    FindingBulkUpdateIn,
    FindingEventOut,
    FindingOut,
    FindingUpdateIn,
    JobDiffOut,
    JobSummaryOut,
    OpsDashboardOut,
    SavedFilterCreateIn,
    SavedFilterOut,
    ScanJobOut,
    ScanScheduleCreateIn,
    ScanScheduleOut,
    ScanScheduleUpdateIn,
)
from app.services import finding_lifecycle as life_svc
from app.services import modules as module_svc
from app.services import ops_jobs as ops_svc
from app.services import saved_filters as filt_svc
from app.services import scan_diff as diff_svc
from app.services import scan_schedule as schedule_svc
from app.services.auth_helpers import get_setting, set_setting, write_audit

router = APIRouter(tags=["ops"])


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# --- schedules ---


@router.get("/settings/scan-schedules", response_model=list[ScanScheduleOut])
def list_schedules(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> list[ScanScheduleOut]:
    return [ScanScheduleOut(**r) for r in schedule_svc.list_schedules(db)]


@router.post("/settings/scan-schedules", response_model=ScanScheduleOut)
def create_schedule(
    body: ScanScheduleCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ScanScheduleOut:
    try:
        row = schedule_svc.create_schedule(
            db,
            actor=user,
            module_id=body.module_id,
            params=body.params,
            interval_sec=body.interval_sec,
            name=body.name,
            enabled=body.enabled,
        )
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="scan_schedule.create",
        actor_user_id=user.id,
        resource=f"scan_schedule:{row['id']}",
        details=row.get("module_id") or "",
    )
    return ScanScheduleOut(**row)


@router.patch("/settings/scan-schedules/{schedule_id}", response_model=ScanScheduleOut)
def update_schedule(
    schedule_id: int,
    body: ScanScheduleUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ScanScheduleOut:
    try:
        row = schedule_svc.update_schedule(
            db,
            schedule_id,
            module_id=body.module_id,
            params=body.params,
            interval_sec=body.interval_sec,
            name=body.name,
            enabled=body.enabled,
        )
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="scan_schedule.update",
        actor_user_id=user.id,
        resource=f"scan_schedule:{schedule_id}",
    )
    return ScanScheduleOut(**row)


@router.delete("/settings/scan-schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> dict:
    try:
        schedule_svc.delete_schedule(db, schedule_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="scan_schedule.delete",
        actor_user_id=user.id,
        resource=f"scan_schedule:{schedule_id}",
    )
    return {"ok": True}


# --- saved filters ---


@router.get("/saved-filters", response_model=list[SavedFilterOut])
def list_saved_filters(
    scope: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> list[SavedFilterOut]:
    return [SavedFilterOut(**r) for r in filt_svc.list_filters(db, user=user, scope=scope)]


@router.post("/saved-filters", response_model=SavedFilterOut)
def create_saved_filter(
    body: SavedFilterCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> SavedFilterOut:
    try:
        row = filt_svc.create_filter(
            db, user=user, scope=body.scope, name=body.name, query=body.query
        )
    except Exception as exc:
        raise _http(exc) from exc
    return SavedFilterOut(**row)


@router.delete("/saved-filters/{filter_id}")
def delete_saved_filter(
    filter_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> dict:
    try:
        filt_svc.delete_filter(db, user=user, filter_id=filter_id)
    except Exception as exc:
        raise _http(exc) from exc
    return {"ok": True}


# --- job diff / summary / retest ---


@router.get("/modules/jobs/{job_id}/diff", response_model=JobDiffOut)
def get_job_diff(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> JobDiffOut:
    try:
        data = diff_svc.job_diff(db, job_id)
    except Exception as exc:
        raise _http(exc) from exc
    return JobDiffOut(
        job_id=data["job_id"],
        previous_job_id=data.get("previous_job_id"),
        new=[FindingOut(**f) for f in data.get("new") or []],
        fixed=[FindingOut(**f) for f in data.get("fixed") or []],
        persistent=[FindingOut(**f) for f in data.get("persistent") or []],
        summary=data.get("summary") or {},
    )


@router.get("/modules/jobs/{job_id}/summary", response_model=JobSummaryOut)
def get_job_summary(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> JobSummaryOut:
    try:
        data = diff_svc.job_summary(db, job_id)
    except Exception as exc:
        raise _http(exc) from exc
    return JobSummaryOut(
        job=ScanJobOut(**data["job"]),
        findings_total=int(data.get("findings_total") or 0),
        by_severity=data.get("by_severity") or {},
        hosts_count=int(data.get("hosts_count") or 0),
        duration_sec=data.get("duration_sec"),
    )


@router.post("/modules/jobs/{job_id}/retest", response_model=ScanJobOut)
def retest_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ScanJobOut:
    try:
        job = diff_svc.retest_job(db, job_id, actor=user)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="modules.job.retest",
        actor_user_id=user.id,
        resource=f"scan_job:{job_id}",
        details=f"retest_job={job.id}",
    )
    return ScanJobOut(**module_svc._job_out(job))


@router.post("/findings/{finding_id}/retest", response_model=ScanJobOut)
def retest_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ScanJobOut:
    try:
        job = diff_svc.retest_finding(db, finding_id, actor=user)
    except Exception as exc:
        raise _http(exc) from exc
    return ScanJobOut(**module_svc._job_out(job))


# --- finding lifecycle ---


@router.patch("/findings/{finding_id}", response_model=FindingOut)
def patch_finding(
    finding_id: int,
    body: FindingUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> FindingOut:
    try:
        row = life_svc.update_finding(
            db,
            finding_id,
            actor=user,
            status=body.status,
            assignee_user_id=body.assignee_user_id,
            clear_assignee=body.clear_assignee,
            reason=body.reason,
            priority=body.priority,
            acceptance_reason=body.acceptance_reason,
            accepted_until=body.accepted_until,
            tags=body.tags,
            project_id=body.project_id,
            clear_project=body.clear_project,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return FindingOut(**row)


@router.post("/findings/bulk", response_model=dict)
def bulk_findings(
    body: FindingBulkUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> dict:
    try:
        return life_svc.bulk_update(
            db,
            actor=user,
            finding_ids=body.finding_ids,
            status=body.status,
            assignee_user_id=body.assignee_user_id,
            clear_assignee=body.clear_assignee,
            reason=body.reason,
            priority=body.priority,
            tags=body.tags,
            acceptance_reason=body.acceptance_reason,
            accepted_until=body.accepted_until,
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/findings/{finding_id}/events", response_model=list[FindingEventOut])
def finding_events(
    finding_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> list[FindingEventOut]:
    try:
        module_svc.get_finding(db, finding_id)
    except Exception as exc:
        raise _http(exc) from exc
    return [FindingEventOut(**e) for e in life_svc.list_events(db, finding_id)]


# --- ops dashboard + alerts ---


@router.get("/dashboard/ops", response_model=OpsDashboardOut)
def dashboard_ops(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> OpsDashboardOut:
    return OpsDashboardOut(**ops_svc.ops_dashboard_stats(db))


@router.get("/alerts/outbox", response_model=list[AlertOutboxOut])
def list_outbox(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:write")),
) -> list[AlertOutboxOut]:
    data = ops_svc.list_alert_outbox(db, status=status_filter, page=page, page_size=page_size)
    return [AlertOutboxOut(**r) for r in data["results"]]


@router.post("/alerts/test")
def alert_test(
    body: AlertTestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings:write")),
) -> dict:
    payload: dict = {"text": body.text, "message": body.text}
    if body.to:
        payload["to"] = body.to
    if body.subject:
        payload["subject"] = body.subject
    row = ops_svc.enqueue_alert(db, channel=body.channel, payload=payload)
    # Try immediate deliver for snappy UX
    delivered = ops_svc.drain_alert_outbox(db, limit=5)
    write_audit(
        db,
        action="alerts.test",
        actor_user_id=user.id,
        resource=f"alert:{row.id}",
        details=body.channel,
    )
    return {"ok": True, "alert_id": row.id, "drained": delivered}


@router.get("/settings/alerts")
def get_alert_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:write")),
) -> dict:
    return {
        "webhook_url": get_setting(db, "alert_webhook_url", ""),
        "email_to": get_setting(db, "alert_email_to", ""),
        "smtp_host": get_setting(db, "smtp_host", "mailhog"),
        "smtp_port": get_setting(db, "smtp_port", "1025"),
        "smtp_from": get_setting(db, "smtp_from", "vbx@localhost"),
        "watchlist_alerts_enabled": get_setting(db, "watchlist_alerts_enabled", "true") == "true",
    }


@router.put("/settings/alerts")
def put_alert_settings(
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings:write")),
) -> dict:
    mapping = {
        "webhook_url": "alert_webhook_url",
        "email_to": "alert_email_to",
        "smtp_host": "smtp_host",
        "smtp_port": "smtp_port",
        "smtp_from": "smtp_from",
    }
    for src, key in mapping.items():
        if src in body and body[src] is not None:
            set_setting(db, key, str(body[src]).strip())
    if "watchlist_alerts_enabled" in body and body["watchlist_alerts_enabled"] is not None:
        set_setting(
            db,
            "watchlist_alerts_enabled",
            "true" if body["watchlist_alerts_enabled"] else "false",
        )
    write_audit(db, action="alerts.settings", actor_user_id=user.id, resource="settings:alerts")
    return {
        "webhook_url": get_setting(db, "alert_webhook_url", ""),
        "email_to": get_setting(db, "alert_email_to", ""),
        "smtp_host": get_setting(db, "smtp_host", "mailhog"),
        "smtp_port": get_setting(db, "smtp_port", "1025"),
        "smtp_from": get_setting(db, "smtp_from", "vbx@localhost"),
        "watchlist_alerts_enabled": get_setting(db, "watchlist_alerts_enabled", "true") == "true",
    }
