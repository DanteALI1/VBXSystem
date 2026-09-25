"""SSO OIDC auth routes."""

from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.auth_routes import _issue_tokens, _set_auth_cookies
from app.core.config import get_settings
from app.core.rate_limit import rate_limit
from app.db import get_db
from app.services.auth_helpers import write_audit
from app.services.sso_oidc import (
    STAGING_CODE,
    build_authorize_url,
    create_sso_state,
    exchange_code,
    get_sso_config,
    parse_sso_state,
    safe_next_path,
    sso_public_status,
    staging_claims,
    upsert_sso_user,
    validate_sso_ready,
)

router = APIRouter(prefix="/auth/sso", tags=["auth-sso"])


@router.get("/status")
def sso_status(db: Session = Depends(get_db)) -> dict:
    return sso_public_status(db)


@router.get("/login")
def sso_login(
    request: Request,
    db: Session = Depends(get_db),
    next: str = Query("/dashboard", alias="next"),
):
    rate_limit(request, "sso_login", limit=30, window=60)
    cfg = get_sso_config(db)
    ok, msg = validate_sso_ready(cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    state = create_sso_state(next_path=next or "/dashboard")
    if cfg["staging"]:
        # Bounce through configured redirect_uri so BFF/cookie path is identical to live.
        q = urlencode({"code": STAGING_CODE, "state": state})
        return RedirectResponse(url=f"{cfg['redirect_uri']}?{q}", status_code=302)

    try:
        url = build_authorize_url(cfg, state=state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RedirectResponse(url=url, status_code=302)


@router.get("/callback")
def sso_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    rate_limit(request, "sso_callback", limit=40, window=60)
    if error:
        detail = error_description or error
        raise HTTPException(status_code=400, detail=f"SSO ошибка IdP: {detail}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Нужны code и state")

    try:
        state_data = parse_sso_state(state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cfg = get_sso_config(db)
    ok, msg = validate_sso_ready(cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    try:
        if code == STAGING_CODE:
            if not cfg["staging"]:
                raise ValueError("Staging code при выключенном staging")
            claims = staging_claims()
        else:
            if cfg["staging"]:
                raise ValueError("В staging принимается только демо-вход")
            claims = exchange_code(cfg, code=code)
        user = upsert_sso_user(db, cfg, claims)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"SSO обмен не удался: {exc}") from exc

    if user.status != "active":
        raise HTTPException(status_code=403, detail="Учётная запись не активна")

    tokens = _issue_tokens(db, user, request, device_label="SSO")
    write_audit(
        db,
        action="auth.sso_login",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        details=f"provider={cfg['provider']};staging={cfg['staging']}",
        ip_address=request.client.host if request.client else None,
    )

    next_path = safe_next_path(state_data.get("next") or "/dashboard")
    wants_json = "application/json" in (request.headers.get("accept") or "")
    if wants_json or request.query_params.get("format") == "json":
        payload = {
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "token_type": "bearer",
            "is_new_device": tokens.is_new_device,
            "next": next_path,
        }
        resp = JSONResponse(content=payload)
        _set_auth_cookies(resp, tokens.access_token, tokens.refresh_token)
        return resp

    # Browser: redirect to web finish page with one-time handoff via query is avoided;
    # prefer public web URL + hash-less cookie path when cookies enabled.
    settings = get_settings()
    public = settings.vbx_public_url.rstrip("/")
    if settings.auth_cookies_effective():
        redirect = RedirectResponse(url=f"{public}{next_path}", status_code=302)
        _set_auth_cookies(redirect, tokens.access_token, tokens.refresh_token)
        return redirect

    # Token handoff for localStorage mode (short-lived, consumed by /login/sso)
    q = urlencode(
        {
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token or "",
            "next": next_path,
        }
    )
    return RedirectResponse(url=f"{public}/login/sso?{q}", status_code=302)