"""Encrypted scanner credential vault CRUD."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import ScanCredential, utcnow
from app.services.crypto_secrets import decrypt_secret, encrypt_secret

CREDENTIAL_KINDS = ("http_form", "http_basic", "zap_context")
PASSWORD_MASK = "********"


def _json_loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _normalize_kind(kind: str | None) -> str:
    v = (kind or "http_form").strip().lower()
    if v not in CREDENTIAL_KINDS:
        raise ValueError(f"kind must be one of: {', '.join(CREDENTIAL_KINDS)}")
    return v


def _normalize_extra(extra: Any) -> dict[str, Any]:
    if extra is None:
        return {}
    if isinstance(extra, str):
        data = _json_loads(extra, {})
    elif isinstance(extra, dict):
        data = extra
    else:
        raise ValueError("extra must be an object")
    if not isinstance(data, dict):
        raise ValueError("extra must be an object")
    # Drop accidental password fields from extra
    cleaned = {str(k): v for k, v in data.items() if str(k).lower() not in {"password", "password_enc"}}
    return cleaned


def credential_public(row: ScanCredential) -> dict[str, Any]:
    """Admin/API view — never returns plaintext password."""
    return {
        "id": row.id,
        "name": row.name or "",
        "kind": row.kind or "http_form",
        "username": row.username or "",
        "password_set": bool(row.password_enc),
        "password_masked": PASSWORD_MASK if row.password_enc else "",
        "extra": _json_loads(row.extra_json, {}),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def credential_internal(row: ScanCredential) -> dict[str, Any]:
    """Worker view — plaintext password once over the internal network."""
    return {
        "id": row.id,
        "name": row.name or "",
        "kind": row.kind or "http_form",
        "username": row.username or "",
        "password": decrypt_secret(row.password_enc or ""),
        "extra": _json_loads(row.extra_json, {}),
    }


def list_credentials(db: Session) -> list[dict[str, Any]]:
    rows = db.query(ScanCredential).order_by(ScanCredential.name.asc(), ScanCredential.id.asc()).all()
    return [credential_public(r) for r in rows]


def get_credential(db: Session, credential_id: int) -> ScanCredential:
    row = db.get(ScanCredential, credential_id)
    if not row:
        raise LookupError(f"credential {credential_id} not found")
    return row


def create_credential(
    db: Session,
    *,
    name: str,
    kind: str,
    username: str = "",
    password: str = "",
    extra: Any = None,
) -> dict[str, Any]:
    name_s = (name or "").strip()
    if not name_s:
        raise ValueError("name is required")
    kind_s = _normalize_kind(kind)
    extra_obj = _normalize_extra(extra)
    row = ScanCredential(
        name=name_s[:255],
        kind=kind_s,
        username=(username or "").strip()[:255],
        password_enc=encrypt_secret(password) if password else "",
        extra_json=json.dumps(extra_obj, ensure_ascii=False),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return credential_public(row)


def update_credential(
    db: Session,
    credential_id: int,
    *,
    name: str | None = None,
    kind: str | None = None,
    username: str | None = None,
    password: str | None = None,
    clear_password: bool = False,
    extra: Any = None,
) -> dict[str, Any]:
    row = get_credential(db, credential_id)
    if name is not None:
        name_s = name.strip()
        if not name_s:
            raise ValueError("name cannot be empty")
        row.name = name_s[:255]
    if kind is not None:
        row.kind = _normalize_kind(kind)
    if username is not None:
        row.username = username.strip()[:255]
    if clear_password:
        row.password_enc = ""
    elif password is not None and password != "":
        row.password_enc = encrypt_secret(password)
    if extra is not None:
        row.extra_json = json.dumps(_normalize_extra(extra), ensure_ascii=False)
    row.updated_at = utcnow()
    db.add(row)
    db.commit()
    db.refresh(row)
    return credential_public(row)


def delete_credential(db: Session, credential_id: int) -> dict[str, Any]:
    row = get_credential(db, credential_id)
    public = credential_public(row)
    db.delete(row)
    db.commit()
    return {"deleted": True, "credential": public}
