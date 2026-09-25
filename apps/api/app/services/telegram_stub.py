"""Telegram notify — live Bot API when configured, else log-only."""

from __future__ import annotations

import json
import logging
import urllib.request

from sqlalchemy.orm import Session

from app.services.auth_helpers import get_setting, set_setting
from app.services.crypto_secrets import decrypt_secret, encrypt_secret, mask_secret

log = logging.getLogger("vbx.telegram")


def get_telegram_config(db: Session) -> dict:
    token = decrypt_secret(get_setting(db, "telegram_bot_token_enc", ""))
    return {
        "enabled": get_setting(db, "telegram_enabled", "false") == "true",
        "bot_token_masked": mask_secret(token) if token else "",
        "bot_token_configured": bool(token),
        "chat_id": get_setting(db, "telegram_chat_id", ""),
    }


def save_telegram_config(db: Session, data: dict) -> None:
    if "enabled" in data and data["enabled"] is not None:
        set_setting(db, "telegram_enabled", "true" if data["enabled"] else "false")
    if "chat_id" in data and data["chat_id"] is not None:
        set_setting(db, "telegram_chat_id", str(data["chat_id"]).strip())
    if data.get("bot_token"):
        set_setting(db, "telegram_bot_token_enc", encrypt_secret(str(data["bot_token"]).strip()))


def send_telegram_message(db: Session, *, text: str) -> dict:
    cfg = get_telegram_config(db)
    token = decrypt_secret(get_setting(db, "telegram_bot_token_enc", ""))
    chat_id = cfg.get("chat_id") or ""
    if not token or not chat_id:
        log.info(
            "telegram skipped (no token/chat_id): enabled=%s text=%r",
            cfg.get("enabled"),
            text[:120],
        )
        return {
            "ok": True,
            "sent": False,
            "message": "Telegram: токен/chat_id не заданы",
        }
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    body = json.dumps({"chat_id": chat_id, "text": (text or "")[:4000]}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
            ok = resp.status < 400
    except Exception as exc:  # noqa: BLE001
        log.warning("telegram send failed: %s", exc)
        return {"ok": False, "sent": False, "message": str(exc)}
    return {"ok": ok, "sent": ok, "message": "отправлено" if ok else "ошибка HTTP"}


def send_telegram_test(db: Session, *, text: str = "VBXSystem Telegram test") -> dict:
    return send_telegram_message(db, text=text)
