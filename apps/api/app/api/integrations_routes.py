from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_super_admin
from app.db import get_db
from app.models import User
from app.schemas import AdGroupSyncOut, IntegrationsOut, MessageOut
from app.services.auth_helpers import get_setting, set_setting, write_audit
from app.services.crypto_secrets import decrypt_secret, encrypt_secret, mask_secret
from app.services.ldap_service import get_ldap_config, save_ldap_config, sync_ldap_groups, test_ldap_connection
from app.services.smtp_service import send_smtp_message
from app.services.sso_oidc import get_sso_config, save_sso_config, validate_sso_ready
from app.services.telegram_stub import get_telegram_config, save_telegram_config, send_telegram_test

router = APIRouter(prefix="/settings/integrations", tags=["settings-integrations"])


def _smtp_out(db: Session) -> dict:
    pwd = decrypt_secret(get_setting(db, "smtp_password_enc", ""))
    return {
        "host": get_setting(db, "smtp_host", "mailhog"),
        "port": int(get_setting(db, "smtp_port", "1025") or "1025"),
        "use_tls": get_setting(db, "smtp_use_tls", "false") == "true",
        "username": get_setting(db, "smtp_username", ""),
        "password_masked": mask_secret(pwd) if pwd else "",
        "password_configured": bool(pwd),
        "from_addr": get_setting(db, "smtp_from", "vbx@localhost"),
    }


def _sso_out(db: Session) -> dict:
    cfg = get_sso_config(db)
    return {
        "enabled": cfg["enabled"],
        "provider": cfg["provider"],
        "client_id": cfg["client_id"],
        "client_secret_masked": cfg["client_secret_masked"],
        "client_secret_configured": cfg["client_secret_configured"],
        "issuer_url": cfg["issuer_url"],
        "authorize_url": cfg["authorize_url"],
        "token_url": cfg["token_url"],
        "userinfo_url": cfg["userinfo_url"],
        "redirect_uri": cfg["redirect_uri"],
        "scopes": cfg["scopes"],
        "staging": cfg["staging"],
        "role_map": cfg["role_map"],
        "button_label": cfg["button_label"],
    }


@router.get("", response_model=IntegrationsOut)
def get_integrations(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> IntegrationsOut:
    return IntegrationsOut(
        smtp=_smtp_out(db),
        ldap=get_ldap_config(db),
        sso=_sso_out(db),
        telegram=get_telegram_config(db),
    )


class SmtpUpdate(BaseModel):
    host: str | None = None
    port: int | None = None
    use_tls: bool | None = None
    username: str | None = None
    password: str | None = None
    from_addr: str | None = None


@router.put("/smtp", response_model=MessageOut)
def update_smtp(
    payload: SmtpUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    if payload.host is not None:
        set_setting(db, "smtp_host", payload.host)
    if payload.port is not None:
        set_setting(db, "smtp_port", str(payload.port))
    if payload.use_tls is not None:
        set_setting(db, "smtp_use_tls", "true" if payload.use_tls else "false")
    if payload.username is not None:
        set_setting(db, "smtp_username", payload.username)
    if payload.password:
        set_setting(db, "smtp_password_enc", encrypt_secret(payload.password))
    if payload.from_addr is not None:
        set_setting(db, "smtp_from", payload.from_addr)
    write_audit(db, action="integrations.smtp_update", actor_user_id=user.id, resource="smtp")
    return MessageOut(message="SMTP настройки сохранены")


class SmtpTestIn(BaseModel):
    to: str = Field(min_length=3, max_length=255)


@router.post("/smtp/test", response_model=MessageOut)
def smtp_test(
    payload: SmtpTestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    cfg = _smtp_out(db)
    pwd = decrypt_secret(get_setting(db, "smtp_password_enc", ""))
    try:
        send_smtp_message(
            host=cfg["host"],
            port=cfg["port"],
            username=cfg["username"],
            password=pwd,
            use_tls=cfg["use_tls"],
            from_addr=cfg["from_addr"],
            to_addr=str(payload.to),
            subject="VBXSystem SMTP test",
            body="Тестовое письмо из VBXSystem (W6 integrations).",
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP ошибка: {exc}") from exc
    write_audit(db, action="integrations.smtp_test", actor_user_id=user.id, resource=str(payload.to))
    return MessageOut(message=f"Тестовое письмо отправлено на {payload.to}")


class LdapUpdate(BaseModel):
    host: str | None = None
    port: int | None = None
    use_tls: bool | None = None
    bind_dn: str | None = None
    bind_password: str | None = None
    base_dn: str | None = None
    user_filter: str | None = None
    group_filter: str | None = None
    mock_mode: bool | None = None
    role_map: dict | None = None


@router.put("/ldap", response_model=MessageOut)
def update_ldap(
    payload: LdapUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    save_ldap_config(db, payload.model_dump(exclude_unset=True))
    write_audit(db, action="integrations.ldap_update", actor_user_id=user.id, resource="ldap")
    return MessageOut(message="LDAP настройки сохранены")


@router.post("/ldap/test", response_model=MessageOut)
def ldap_test(db: Session = Depends(get_db), user: User = Depends(require_super_admin)) -> MessageOut:
    result = test_ldap_connection(db)
    write_audit(db, action="integrations.ldap_test", actor_user_id=user.id, resource="ldap", details=str(result))
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message", "LDAP test failed"))
    return MessageOut(message=result.get("message", "OK"))


class LdapSyncIn(BaseModel):
    dry_run: bool = False
    ou_filter: str | None = None


@router.post("/ldap/sync-groups", response_model=AdGroupSyncOut)
def ldap_sync_groups(
    payload: LdapSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> AdGroupSyncOut:
    result = sync_ldap_groups(db, dry_run=payload.dry_run, ou_filter=payload.ou_filter)
    write_audit(db, action="integrations.ldap_sync", actor_user_id=user.id, resource="ldap", details=str(result))
    return AdGroupSyncOut(
        status=result["status"],
        message=result["message"],
        planned=result.get("planned") or [],
        created=result.get("created", 0),
        updated=result.get("updated", 0),
    )


class SsoUpdate(BaseModel):
    enabled: bool | None = None
    provider: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    issuer_url: str | None = None
    authorize_url: str | None = None
    token_url: str | None = None
    userinfo_url: str | None = None
    redirect_uri: str | None = None
    scopes: str | None = None
    staging: bool | None = None
    role_map: dict | None = None
    button_label: str | None = None


@router.put("/sso", response_model=MessageOut)
def update_sso(
    payload: SsoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    save_sso_config(db, payload.model_dump(exclude_unset=True))
    write_audit(db, action="integrations.sso_update", actor_user_id=user.id, resource="sso")
    return MessageOut(message="SSO настройки сохранены")


@router.post("/sso/test", response_model=MessageOut)
def sso_test(db: Session = Depends(get_db), user: User = Depends(require_super_admin)) -> MessageOut:
    cfg = get_sso_config(db)
    ok, msg = validate_sso_ready(cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    write_audit(db, action="integrations.sso_test", actor_user_id=user.id, resource="sso")
    mode = "staging" if cfg["staging"] else "live"
    hint = (
        "Демо-вход: /auth/sso/login (без IdP)."
        if cfg["staging"]
        else f"Redirect URI для IdP: {cfg['redirect_uri']}"
    )
    return MessageOut(message=f"SSO {cfg['provider']} ({mode}): {msg}. {hint}")


class TelegramUpdate(BaseModel):
    enabled: bool | None = None
    bot_token: str | None = None
    chat_id: str | None = None


@router.put("/telegram", response_model=MessageOut)
def update_telegram(
    payload: TelegramUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    save_telegram_config(db, payload.model_dump(exclude_unset=True))
    write_audit(db, action="integrations.telegram_update", actor_user_id=user.id, resource="telegram")
    return MessageOut(message="Telegram настройки сохранены")


@router.post("/telegram/test", response_model=MessageOut)
def telegram_test(
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
) -> MessageOut:
    result = send_telegram_test(db)
    write_audit(
        db,
        action="integrations.telegram_test",
        actor_user_id=user.id,
        resource="telegram",
        details=str(result),
    )
    return MessageOut(message=result.get("message", "OK"))
