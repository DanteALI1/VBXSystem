from datetime import datetime

from sqlalchemy.orm import Session

from app.models import AuditLog, LoginSession, SystemSetting, User, utcnow


def write_audit(
    db: Session,
    *,
    action: str,
    actor_user_id: int | None = None,
    resource: str = "",
    details: str = "",
    ip_address: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            resource=resource,
            details=details,
            ip_address=ip_address,
        )
    )
    db.commit()


def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(SystemSetting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(SystemSetting, key)
    if row:
        row.value = value
        row.updated_at = utcnow()
    else:
        db.add(SystemSetting(key=key, value=value))
    db.commit()


def track_login_session(
    db: Session,
    user: User,
    *,
    device_label: str,
    user_agent: str,
    ip_address: str | None,
) -> tuple[LoginSession, bool]:
    label = (device_label or user_agent[:80] or "unknown").strip()[:255]
    existing = (
        db.query(LoginSession)
        .filter(LoginSession.user_id == user.id, LoginSession.device_label == label)
        .order_by(LoginSession.id.desc())
        .first()
    )
    is_new = existing is None
    if existing:
        existing.last_seen_at = utcnow()
        existing.ip_address = ip_address
        existing.user_agent = user_agent[:512]
        session = existing
    else:
        session = LoginSession(
            user_id=user.id,
            device_label=label,
            user_agent=user_agent[:512],
            ip_address=ip_address,
            is_new_device=True,
            created_at=utcnow(),
            last_seen_at=utcnow(),
        )
        db.add(session)
    user.last_login_at = utcnow()
    db.commit()
    db.refresh(session)
    return session, is_new
