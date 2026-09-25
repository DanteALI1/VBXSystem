"""OIDC SSO helpers: config, authorize URL, code exchange, user upsert."""

from __future__ import annotations

import hashlib
import json
import secrets
from typing import Any
from urllib.parse import urlencode, urljoin

import httpx
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Role, User, utcnow
from app.services.auth_helpers import get_setting, set_setting
from app.services.crypto_secrets import decrypt_secret, encrypt_secret, mask_secret

STAGING_CODE = "vbx-staging"
DEFAULT_SCOPES = "openid profile email"


def get_sso_config(db: Session) -> dict[str, Any]:
    secret = decrypt_secret(get_setting(db, "sso_client_secret_enc", ""))
    role_map_raw = get_setting(db, "sso_role_map_json", "{}") or "{}"
    try:
        role_map = json.loads(role_map_raw)
    except json.JSONDecodeError:
        role_map = {}
    public = get_settings().vbx_public_url.rstrip("/")
    redirect = get_setting(db, "sso_redirect_uri", "") or f"{public}/api/auth/sso/callback"
    return {
        "enabled": get_setting(db, "sso_enabled", "false") == "true",
        "provider": get_setting(db, "sso_provider", "oidc"),
        "client_id": get_setting(db, "sso_client_id", ""),
        "client_secret_masked": mask_secret(secret) if secret else "",
        "client_secret_configured": bool(secret),
        "client_secret": secret,
        "issuer_url": get_setting(db, "sso_issuer_url", "").rstrip("/"),
        "authorize_url": get_setting(db, "sso_authorize_url", ""),
        "token_url": get_setting(db, "sso_token_url", ""),
        "userinfo_url": get_setting(db, "sso_userinfo_url", ""),
        "redirect_uri": redirect,
        "scopes": get_setting(db, "sso_scopes", DEFAULT_SCOPES) or DEFAULT_SCOPES,
        "staging": get_setting(db, "sso_staging", "true") == "true",
        "role_map": role_map if isinstance(role_map, dict) else {},
        "button_label": get_setting(db, "sso_button_label", "Войти через SSO")
        or "Войти через SSO",
    }


def sso_public_status(db: Session) -> dict[str, Any]:
    cfg = get_sso_config(db)
    return {
        "enabled": cfg["enabled"],
        "staging": cfg["staging"],
        "provider": cfg["provider"],
        "button_label": cfg["button_label"],
    }


def save_sso_config(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "enabled": ("sso_enabled", lambda v: "true" if v else "false"),
        "provider": ("sso_provider", str),
        "client_id": ("sso_client_id", str),
        "issuer_url": ("sso_issuer_url", str),
        "authorize_url": ("sso_authorize_url", str),
        "token_url": ("sso_token_url", str),
        "userinfo_url": ("sso_userinfo_url", str),
        "redirect_uri": ("sso_redirect_uri", str),
        "scopes": ("sso_scopes", str),
        "staging": ("sso_staging", lambda v: "true" if v else "false"),
        "button_label": ("sso_button_label", str),
    }
    for src, (key, conv) in mapping.items():
        if src in payload and payload[src] is not None:
            set_setting(db, key, conv(payload[src]))
    if payload.get("client_secret"):
        set_setting(db, "sso_client_secret_enc", encrypt_secret(str(payload["client_secret"])))
    if "role_map" in payload and payload["role_map"] is not None:
        set_setting(db, "sso_role_map_json", json.dumps(payload["role_map"], ensure_ascii=False))
    return get_sso_config(db)


def safe_next_path(next_path: str | None) -> str:
    """Allow only same-origin relative paths (block //evil open redirects)."""
    p = (next_path or "/dashboard").strip() or "/dashboard"
    if not p.startswith("/") or p.startswith("//") or "://" in p or "\\" in p:
        return "/dashboard"
    return p


def create_sso_state(*, next_path: str = "/dashboard") -> str:
    settings = get_settings()
    nonce = secrets.token_urlsafe(16)
    payload = {
        "typ": "sso_state",
        "next": safe_next_path(next_path),
        "nonce": nonce,
    }
    return jwt.encode(payload, settings.vbx_secret_key, algorithm="HS256")


def parse_sso_state(state: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        data = jwt.decode(state, settings.vbx_secret_key, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Недействительный state") from exc
    if data.get("typ") != "sso_state":
        raise ValueError("Недействительный state")
    data["next"] = safe_next_path(data.get("next"))
    return data


def _discover(issuer: str) -> dict[str, str]:
    url = urljoin(issuer.rstrip("/") + "/", ".well-known/openid-configuration")
    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        data = r.json()
    return {
        "authorize_url": data.get("authorization_endpoint") or "",
        "token_url": data.get("token_endpoint") or "",
        "userinfo_url": data.get("userinfo_endpoint") or "",
    }


def resolve_endpoints(cfg: dict[str, Any]) -> dict[str, str]:
    authorize = cfg.get("authorize_url") or ""
    token = cfg.get("token_url") or ""
    userinfo = cfg.get("userinfo_url") or ""
    if (not authorize or not token) and cfg.get("issuer_url"):
        discovered = _discover(cfg["issuer_url"])
        authorize = authorize or discovered["authorize_url"]
        token = token or discovered["token_url"]
        userinfo = userinfo or discovered["userinfo_url"]
    return {"authorize_url": authorize, "token_url": token, "userinfo_url": userinfo}


def build_authorize_url(cfg: dict[str, Any], *, state: str) -> str:
    endpoints = resolve_endpoints(cfg)
    if not endpoints["authorize_url"]:
        raise ValueError("Не задан authorize_url / issuer_url")
    if not cfg.get("client_id"):
        raise ValueError("Не задан client_id")
    q = urlencode(
        {
            "response_type": "code",
            "client_id": cfg["client_id"],
            "redirect_uri": cfg["redirect_uri"],
            "scope": cfg.get("scopes") or DEFAULT_SCOPES,
            "state": state,
        }
    )
    base = endpoints["authorize_url"]
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{q}"


def exchange_code(cfg: dict[str, Any], *, code: str) -> dict[str, Any]:
    endpoints = resolve_endpoints(cfg)
    if not endpoints["token_url"]:
        raise ValueError("Не задан token_url / issuer_url")
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": cfg["redirect_uri"],
        "client_id": cfg["client_id"],
    }
    if cfg.get("client_secret"):
        data["client_secret"] = cfg["client_secret"]
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        r = client.post(
            endpoints["token_url"],
            data=data,
            headers={"Accept": "application/json"},
        )
        if r.status_code >= 400:
            raise ValueError(f"Token endpoint: HTTP {r.status_code}")
        tokens = r.json()
    claims: dict[str, Any] = {}
    id_token = tokens.get("id_token")
    if id_token:
        # Signature verification against JWKS is deferred; we still fetch userinfo when possible.
        claims = jwt.get_unverified_claims(id_token)
    access = tokens.get("access_token")
    if endpoints.get("userinfo_url") and access:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            ur = client.get(
                endpoints["userinfo_url"],
                headers={"Authorization": f"Bearer {access}"},
            )
            if ur.status_code < 400:
                info = ur.json()
                if isinstance(info, dict):
                    claims = {**claims, **info}
    if not claims:
        raise ValueError("IdP не вернул id_token/userinfo")
    return claims


def staging_claims() -> dict[str, Any]:
    return {
        "sub": "vbx-staging-sso",
        "email": "sso.demo@example.local",
        "preferred_username": "sso_demo",
        "name": "SSO Demo User",
        "groups": ["viewer"],
    }


def _slug_username(raw: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in raw.strip())[:60]
    return cleaned or f"sso_{secrets.token_hex(4)}"


def _roles_from_claims(db: Session, cfg: dict[str, Any], claims: dict[str, Any]) -> list[Role]:
    role_map: dict[str, str] = cfg.get("role_map") or {}
    group_vals: list[str] = []
    for key in ("groups", "roles", "realm_access"):
        raw = claims.get(key)
        if isinstance(raw, list):
            group_vals.extend(str(x) for x in raw)
        elif isinstance(raw, dict) and key == "realm_access":
            roles = raw.get("roles")
            if isinstance(roles, list):
                group_vals.extend(str(x) for x in roles)
        elif isinstance(raw, str):
            group_vals.append(raw)
    codes: set[str] = set()
    for g in group_vals:
        mapped = role_map.get(g) or role_map.get(g.lower())
        if mapped:
            codes.add(str(mapped))
        elif g in {"viewer", "analyst", "admin", "super_admin", "ticket_manager"}:
            codes.add(g)
    if not codes:
        codes.add("viewer")
    roles = db.query(Role).filter(Role.code.in_(list(codes))).all()
    if not roles:
        viewer = db.query(Role).filter_by(code="viewer").one_or_none()
        return [viewer] if viewer else []
    return roles


def upsert_sso_user(db: Session, cfg: dict[str, Any], claims: dict[str, Any]) -> User:
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        raise ValueError("В claims нет sub")
    email = str(claims.get("email") or f"{sub}@sso.local").strip().lower()
    preferred = str(
        claims.get("preferred_username") or claims.get("nickname") or email.split("@")[0]
    )
    username = _slug_username(preferred)
    full_name = str(claims.get("name") or claims.get("given_name") or preferred)

    user = (
        db.query(User)
        .filter(User.external_sub == sub, User.auth_provider == "oidc")
        .one_or_none()
    )
    if not user:
        user = db.query(User).filter(User.email == email).one_or_none()
    if not user:
        # ensure unique username
        base = username
        n = 0
        while db.query(User).filter(User.username == username).first():
            n += 1
            username = f"{base}_{n}"
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            full_name=full_name,
            status="active",
            auth_provider="oidc",
            external_sub=sub,
        )
        db.add(user)
        db.flush()
    else:
        user.auth_provider = "oidc"
        user.external_sub = sub
        if full_name:
            user.full_name = full_name
        if user.status == "pending":
            user.status = "active"
        if email and user.email != email:
            clash = db.query(User).filter(User.email == email, User.id != user.id).first()
            if not clash:
                user.email = email

    roles = _roles_from_claims(db, cfg, claims)
    if roles:
        user.roles = roles
    user.last_login_at = utcnow()
    db.commit()
    db.refresh(user)
    return user


def validate_sso_ready(cfg: dict[str, Any]) -> tuple[bool, str]:
    if not cfg.get("enabled"):
        return False, "SSO выключен"
    if cfg.get("staging"):
        return True, "staging OK"
    if not cfg.get("client_id"):
        return False, "Укажите client_id"
    if not cfg.get("issuer_url") and not (cfg.get("authorize_url") and cfg.get("token_url")):
        return False, "Укажите issuer_url или authorize/token URL"
    if not cfg.get("client_secret"):
        return False, "Укажите client_secret"
    return True, "live OK"


def fingerprint_claims(claims: dict[str, Any]) -> str:
    raw = json.dumps(claims, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
