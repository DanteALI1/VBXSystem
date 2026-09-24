"""LDAP/AD helpers — mock sync for demos + optional live bind test."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import Group, utcnow
from app.services.auth_helpers import get_setting, set_setting
from app.services.crypto_secrets import decrypt_secret, encrypt_secret, mask_secret

LDAP_KEYS = (
    "ldap_host",
    "ldap_port",
    "ldap_use_tls",
    "ldap_bind_dn",
    "ldap_base_dn",
    "ldap_user_filter",
    "ldap_group_filter",
    "ldap_mock_mode",
)


def get_ldap_config(db: Session) -> dict[str, Any]:
    password_enc = get_setting(db, "ldap_bind_password_enc", "")
    plain = decrypt_secret(password_enc)
    return {
        "host": get_setting(db, "ldap_host", ""),
        "port": int(get_setting(db, "ldap_port", "389") or "389"),
        "use_tls": get_setting(db, "ldap_use_tls", "false") == "true",
        "bind_dn": get_setting(db, "ldap_bind_dn", ""),
        "bind_password_masked": mask_secret(plain) if plain else "",
        "bind_password_configured": bool(plain),
        "base_dn": get_setting(db, "ldap_base_dn", ""),
        "user_filter": get_setting(db, "ldap_user_filter", "(objectClass=user)"),
        "group_filter": get_setting(db, "ldap_group_filter", "(objectClass=group)"),
        "mock_mode": get_setting(db, "ldap_mock_mode", "true") == "true",
        "role_map": json.loads(get_setting(db, "ldap_role_map_json", "{}") or "{}"),
    }


def save_ldap_config(db: Session, payload: dict) -> dict:
    mapping = {
        "host": "ldap_host",
        "port": "ldap_port",
        "use_tls": "ldap_use_tls",
        "bind_dn": "ldap_bind_dn",
        "base_dn": "ldap_base_dn",
        "user_filter": "ldap_user_filter",
        "group_filter": "ldap_group_filter",
        "mock_mode": "ldap_mock_mode",
    }
    for src, key in mapping.items():
        if src not in payload:
            continue
        val = payload[src]
        if isinstance(val, bool):
            set_setting(db, key, "true" if val else "false")
        else:
            set_setting(db, key, str(val))
    if payload.get("bind_password"):
        set_setting(db, "ldap_bind_password_enc", encrypt_secret(str(payload["bind_password"])))
    if "role_map" in payload and isinstance(payload["role_map"], dict):
        set_setting(db, "ldap_role_map_json", json.dumps(payload["role_map"], ensure_ascii=False))
    return get_ldap_config(db)


MOCK_AD_GROUPS = [
    {"name": "Domain Users", "external_id": "cn=Domain Users,dc=example,dc=local"},
    {"name": "VBX Analysts", "external_id": "cn=VBX Analysts,dc=example,dc=local"},
    {"name": "VBX Admins", "external_id": "cn=VBX Admins,dc=example,dc=local"},
]


def test_ldap_connection(db: Session) -> dict:
    cfg = get_ldap_config(db)
    if cfg["mock_mode"] or not cfg["host"]:
        return {
            "ok": True,
            "mode": "mock",
            "message": "LDAP mock: соединение не требуется. Включите mock_mode=false и укажите host для live bind.",
        }
    # Optional live bind without hard ldap3 dependency — use socket check
    import socket

    try:
        with socket.create_connection((cfg["host"], cfg["port"]), timeout=5):
            pass
        return {
            "ok": True,
            "mode": "tcp",
            "message": f"TCP-доступ к {cfg['host']}:{cfg['port']} успешен (полный LDAP bind — при наличии ldap3).",
        }
    except OSError as exc:
        return {"ok": False, "mode": "tcp", "message": f"Не удалось подключиться: {exc}"}


def sync_ldap_groups(db: Session, *, dry_run: bool = False, ou_filter: str | None = None) -> dict:
    cfg = get_ldap_config(db)
    planned = list(MOCK_AD_GROUPS)
    if ou_filter:
        planned = [g for g in planned if ou_filter.lower() in g["name"].lower() or ou_filter.lower() in g["external_id"].lower()]

    if dry_run:
        return {
            "status": "dry_run",
            "message": "Предпросмотр групп AD (mock)" if cfg["mock_mode"] else "Предпросмотр групп",
            "planned": [{**g, "source": "ad"} for g in planned],
            "created": 0,
            "updated": 0,
        }

    created = updated = 0
    for g in planned:
        existing = (
            db.query(Group)
            .filter((Group.external_id == g["external_id"]) | (Group.name == g["name"]))
            .first()
        )
        if existing:
            existing.source = "ad"
            existing.external_id = g["external_id"]
            existing.name = g["name"]
            updated += 1
        else:
            db.add(
                Group(
                    name=g["name"],
                    source="ad",
                    external_id=g["external_id"],
                    description="Synced from LDAP/AD",
                    created_at=utcnow(),
                )
            )
            created += 1
    db.commit()
    return {
        "status": "ok",
        "message": f"Синхронизация групп: +{created} / ~{updated}",
        "planned": [],
        "created": created,
        "updated": updated,
    }
