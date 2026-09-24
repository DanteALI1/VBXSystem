"""API key create / verify helpers."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import ApiKey, utcnow


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_api_key(
    db: Session,
    *,
    owner_user_id: int,
    name: str,
    scopes: list[str],
    expires_days: int | None = 90,
) -> tuple[ApiKey, str]:
    raw = "vbx_" + secrets.token_urlsafe(32)
    prefix = raw[:12]
    expires_at = None
    if expires_days and expires_days > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)
    row = ApiKey(
        name=name.strip() or "API key",
        prefix=prefix,
        key_hash=_hash_key(raw),
        scopes_json=json.dumps(scopes or ["vuln:read"], ensure_ascii=False),
        owner_user_id=owner_user_id,
        expires_at=expires_at,
        created_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, raw


def revoke_api_key(db: Session, key_id: int, *, owner_user_id: int | None = None) -> ApiKey | None:
    q = db.query(ApiKey).filter(ApiKey.id == key_id)
    if owner_user_id is not None:
        q = q.filter(ApiKey.owner_user_id == owner_user_id)
    row = q.one_or_none()
    if not row:
        return None
    row.revoked_at = utcnow()
    db.commit()
    db.refresh(row)
    return row


def list_api_keys(db: Session, *, owner_user_id: int | None = None) -> list[ApiKey]:
    q = db.query(ApiKey)
    if owner_user_id is not None:
        q = q.filter(ApiKey.owner_user_id == owner_user_id)
    return q.order_by(ApiKey.id.desc()).all()


def resolve_api_key(db: Session, raw: str) -> ApiKey | None:
    if not raw or not raw.startswith("vbx_"):
        return None
    row = db.query(ApiKey).filter(ApiKey.key_hash == _hash_key(raw)).one_or_none()
    if not row or row.revoked_at is not None:
        return None
    if row.expires_at is not None:
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return None
    row.last_used_at = utcnow()
    db.commit()
    return row


def key_scopes(row: ApiKey) -> list[str]:
    try:
        data = json.loads(row.scopes_json or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []
