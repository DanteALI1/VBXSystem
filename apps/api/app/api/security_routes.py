"""Security settings + audit log viewer/export."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions, require_super_admin
from app.db import get_db
from app.models import AuditLog, User
from app.schemas import AuditLogOut, MessageOut, SecuritySettingsOut
from app.services.auth_helpers import get_setting, set_setting, write_audit
from app.services.csv_export import dicts_to_csv

router = APIRouter(prefix="/settings/security", tags=["settings-security"])

_MTLS_DEFAULT = (
    "mTLS enforcement is on the reverse-proxy / ingress, not inside FastAPI.\n\n"
    "1) Terminate TLS on nginx/Traefik/HAProxy and enable client certificate verify "
    "(ssl_verify_client on / tls.options.clientAuth).\n"
    "2) Trust only your org CA — paste the CA PEM below for inventory/docs; "
    "the proxy must load the same CA.\n"
    "3) Optionally forward verified identity headers (e.g. ssl_client_s_dn) if you "
    "extend auth later; VBX currently treats mTLS as network-edge policy.\n"
    "4) Keep VBX listening on an internal network; do not expose :8000 publicly "
    "without the proxy.\n"
)


class SecurityUpdate(BaseModel):
    force_2fa: bool | None = None
    new_device_alerts: bool | None = None
    mtls_enabled: bool | None = None
    mtls_instructions: str | None = None


def _audit_query(
    db: Session,
    *,
    user_id: int | None,
    action: str | None,
    date_from: str | None,
    date_to: str | None,
):
    q = db.query(AuditLog)
    if user_id is not None:
        q = q.filter(AuditLog.actor_user_id == user_id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if date_from:
        try:
            df = datetime.fromisoformat(date_from)
            q = q.filter(AuditLog.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            q = q.filter(AuditLog.created_at <= dt)
        except ValueError:
            pass
    return q.order_by(AuditLog.id.desc())


def _audit_out(r: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=r.id,
        actor_user_id=r.actor_user_id,
        action=r.action,
        resource=r.resource,
        details=r.details,
        ip_address=r.ip_address,
        created_at=r.created_at,
    )


@router.get("", response_model=SecuritySettingsOut)
def get_security(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:read")),
) -> SecuritySettingsOut:
    return SecuritySettingsOut(
        force_2fa=get_setting(db, "force_2fa", "false") == "true",
        new_device_alerts=get_setting(db, "new_device_alerts", "true") == "true",
        mtls_enabled=get_setting(db, "mtls_enabled", "false") == "true",
        mtls_ca_configured=bool(get_setting(db, "mtls_ca_pem", "")),
        mtls_instructions=get_setting(db, "mtls_instructions", _MTLS_DEFAULT),
    )


@router.put("", response_model=SecuritySettingsOut)
def update_security(
    payload: SecurityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> SecuritySettingsOut:
    if payload.force_2fa is not None:
        set_setting(db, "force_2fa", "true" if payload.force_2fa else "false")
    if payload.new_device_alerts is not None:
        set_setting(db, "new_device_alerts", "true" if payload.new_device_alerts else "false")
    if payload.mtls_enabled is not None:
        set_setting(db, "mtls_enabled", "true" if payload.mtls_enabled else "false")
    if payload.mtls_instructions is not None:
        set_setting(db, "mtls_instructions", payload.mtls_instructions)
    write_audit(db, action="security.update", actor_user_id=user.id, resource="security")
    return SecuritySettingsOut(
        force_2fa=get_setting(db, "force_2fa", "false") == "true",
        new_device_alerts=get_setting(db, "new_device_alerts", "true") == "true",
        mtls_enabled=get_setting(db, "mtls_enabled", "false") == "true",
        mtls_ca_configured=bool(get_setting(db, "mtls_ca_pem", "")),
        mtls_instructions=get_setting(db, "mtls_instructions", ""),
    )


class MtlsCaUpload(BaseModel):
    ca_pem: str = Field(min_length=20, max_length=100_000)


@router.put("/mtls-ca", response_model=MessageOut)
def upload_mtls_ca(
    payload: MtlsCaUpload,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    if "BEGIN CERTIFICATE" not in payload.ca_pem:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Ожидается PEM сертификат CA")
    set_setting(db, "mtls_ca_pem", payload.ca_pem.strip())
    write_audit(db, action="security.mtls_ca", actor_user_id=user.id, resource="mtls")
    return MessageOut(message="CA сертификат сохранён (для документации/прокси)")


@router.get("/audit", response_model=list[AuditLogOut])
def list_audit(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("audit:read")),
) -> list[AuditLogOut]:
    rows = _audit_query(
        db, user_id=user_id, action=action, date_from=date_from, date_to=date_to
    ).limit(limit).all()
    return [_audit_out(r) for r in rows]


@router.get("/audit/export")
def export_audit_csv(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("audit:read")),
):
    rows = _audit_query(
        db, user_id=user_id, action=action, date_from=date_from, date_to=date_to
    ).limit(limit).all()
    headers = ("id", "created_at", "actor_user_id", "action", "resource", "details", "ip_address")
    payload = [
        {
            "id": r.id,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "actor_user_id": r.actor_user_id,
            "action": r.action,
            "resource": r.resource,
            "details": r.details,
            "ip_address": r.ip_address,
        }
        for r in rows
    ]
    csv_text = dicts_to_csv(headers, payload)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit-export.csv"'},
    )
