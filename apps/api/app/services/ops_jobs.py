"""Ops worker tick: due scan schedules + alert outbox drain."""

from __future__ import annotations

import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Any

from sqlalchemy.orm import Session

from app.models import AlertOutbox, utcnow
from app.services import scan_schedule as schedule_svc
from app.services.auth_helpers import get_setting
from app.services.crypto_secrets import decrypt_secret
from app.services.telegram_stub import get_telegram_config

log = logging.getLogger("vbx.ops")


def process_ops_once(db: Session) -> int:
    """Run one ops tick. Returns number of units of work done."""
    n = 0
    n += schedule_svc.tick_due_schedules(db)
    n += drain_alert_outbox(db, limit=20)
    try:
        from app.services.finding_risk import backfill_risk_scores, reopen_expired_acceptances

        n += reopen_expired_acceptances(db, limit=50)
        n += backfill_risk_scores(db, limit=100)
    except Exception:
        log.exception("risk/acceptance ops tick failed")
    return n


def retry_alert(db: Session, alert_id: int) -> dict[str, Any]:
    row = db.get(AlertOutbox, alert_id)
    if not row:
        raise LookupError("Alert not found")
    row.status = "pending"
    row.last_error = ""
    db.commit()
    db.refresh(row)
    drain_alert_outbox(db, limit=5)
    db.refresh(row)
    return _alert_out(row)


def enqueue_alert(
    db: Session,
    *,
    channel: str,
    payload: dict[str, Any],
) -> AlertOutbox:
    row = AlertOutbox(
        channel=(channel or "webhook").strip()[:64],
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
        status="pending",
        attempts=0,
        last_error="",
        created_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_alert_outbox(
    db: Session,
    *,
    status: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(AlertOutbox)
    if status:
        q = q.filter(AlertOutbox.status == status.strip())
    total = q.count()
    rows = (
        q.order_by(AlertOutbox.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [_alert_out(r) for r in rows],
    }


def _alert_out(r: AlertOutbox) -> dict[str, Any]:
    try:
        payload = json.loads(r.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": r.id,
        "channel": r.channel,
        "payload": payload if isinstance(payload, dict) else {},
        "status": r.status,
        "attempts": r.attempts,
        "last_error": r.last_error or "",
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "sent_at": r.sent_at.isoformat() if r.sent_at else None,
    }


def drain_alert_outbox(db: Session, *, limit: int = 20) -> int:
    rows = (
        db.query(AlertOutbox)
        .filter(AlertOutbox.status == "pending")
        .order_by(AlertOutbox.id.asc())
        .limit(limit)
        .all()
    )
    done = 0
    for row in rows:
        try:
            _deliver(db, row)
            row.status = "sent"
            row.sent_at = utcnow()
            row.last_error = ""
            done += 1
        except Exception as exc:  # noqa: BLE001
            row.attempts = int(row.attempts or 0) + 1
            row.last_error = str(exc)[:2000]
            if row.attempts >= 5:
                row.status = "failed"
            log.warning("alert %s failed: %s", row.id, exc)
        db.commit()
    return done


def _deliver(db: Session, row: AlertOutbox) -> None:
    try:
        payload = json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {"text": str(payload)}
    channel = (row.channel or "").lower()
    if channel == "telegram":
        _send_telegram(db, payload)
    elif channel == "email":
        _send_email(db, payload)
    elif channel in ("webhook", "slack", "teams"):
        _send_webhook(db, payload)
    else:
        raise ValueError(f"unknown channel: {channel}")


def _send_telegram(db: Session, payload: dict[str, Any]) -> None:
    cfg = get_telegram_config(db)
    token = decrypt_secret(get_setting(db, "telegram_bot_token_enc", "")) or ""
    chat_id = (cfg.get("chat_id") or "").strip()
    if not cfg.get("enabled") or not token or not chat_id:
        raise RuntimeError("telegram not configured")
    text = str(payload.get("text") or payload.get("message") or json.dumps(payload, ensure_ascii=False))
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    body = json.dumps({"chat_id": chat_id, "text": text[:4000]}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
        if resp.status >= 400:
            raise RuntimeError(f"telegram HTTP {resp.status}")


def _send_webhook(db: Session, payload: dict[str, Any]) -> None:
    url = (get_setting(db, "alert_webhook_url", "") or "").strip()
    url = url or str(payload.get("url") or "").strip()
    if not url:
        raise RuntimeError("webhook url not configured")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
        if resp.status >= 400:
            raise RuntimeError(f"webhook HTTP {resp.status}")


def _send_email(db: Session, payload: dict[str, Any]) -> None:
    host = (get_setting(db, "smtp_host", "") or "").strip() or "mailhog"
    port = int(get_setting(db, "smtp_port", "1025") or "1025")
    from_addr = (get_setting(db, "smtp_from", "") or "").strip() or "vbx@localhost"
    to_addr = str(payload.get("to") or get_setting(db, "alert_email_to", "") or "").strip()
    if not to_addr:
        raise RuntimeError("email recipient not configured")
    subject = str(payload.get("subject") or "VBXSystem alert")
    text = str(payload.get("text") or payload.get("message") or "")
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(text)
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.send_message(msg)


def ops_dashboard_stats(db: Session) -> dict[str, Any]:
    """Lightweight ops KPIs for dashboard widgets."""
    from datetime import timedelta

    from sqlalchemy import func

    from app.models import Finding, ScanJob

    now = utcnow()
    week_ago = now - timedelta(days=7)
    open_by_sev = (
        db.query(Finding.severity, func.count(Finding.id))
        .filter(Finding.status.in_(["open", "triaged"]))
        .group_by(Finding.severity)
        .all()
    )
    jobs_week = (
        db.query(ScanJob.status, func.count(ScanJob.id))
        .filter(ScanJob.created_at >= week_ago)
        .group_by(ScanJob.status)
        .all()
    )
    success = sum(c for s, c in jobs_week if (s or "").lower() in ("success", "succeeded", "completed", "done"))
    failed = sum(c for s, c in jobs_week if (s or "").lower() in ("failed", "error", "aborted"))
    total_week = sum(c for _, c in jobs_week) or 0
    success_rate = round((success / total_week) * 100.0, 1) if total_week else None
    running = (
        db.query(func.count(ScanJob.id))
        .filter(ScanJob.status.in_(["pending", "queued", "running"]))
        .scalar()
        or 0
    )
    top_assets = (
        db.query(Finding.asset_id, func.count(Finding.id).label("cnt"))
        .filter(Finding.asset_id.isnot(None), Finding.status.in_(["open", "triaged"]))
        .group_by(Finding.asset_id)
        .order_by(func.count(Finding.id).desc())
        .limit(8)
        .all()
    )
    from app.models import Asset

    top_out = []
    for asset_id, cnt in top_assets:
        a = db.query(Asset).filter(Asset.id == asset_id).first()
        top_out.append(
            {
                "asset_id": asset_id,
                "label": (a.hostname or a.ip or f"#{asset_id}") if a else f"#{asset_id}",
                "open_findings": int(cnt),
            }
        )
    return {
        "open_by_severity": {str(s or "UNKNOWN"): int(c) for s, c in open_by_sev},
        "scan_success_rate_7d": success_rate,
        "scan_jobs_7d": {"success": success, "failed": failed, "total": total_week},
        "active_jobs": int(running),
        "top_assets_by_findings": top_out,
    }
