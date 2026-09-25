import base64
import io
import secrets

import pyotp
import qrcode
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.serializers import user_to_out
from app.core.config import get_settings
from app.core.rate_limit import rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_temp_2fa_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db import get_db
from app.models import RecoveryCode, Role, User, utcnow
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageOut,
    RefreshRequest,
    RegisterRequest,
    SessionModeOut,
    TotpEnableOut,
    TotpEnableRequest,
    TotpSetupOut,
    TwoFAVerifyRequest,
    UserOut,
)
from app.services.auth_helpers import get_setting, track_login_session, write_audit

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_meta(request: Request) -> tuple[str | None, str]:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")
    return ip, ua


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    settings = get_settings()
    if not settings.auth_cookies_effective():
        return
    common = {
        "httponly": True,
        "samesite": "lax",
        "secure": settings.vbx_cookie_secure,
        "path": "/",
    }
    response.set_cookie(
        settings.vbx_access_cookie,
        access,
        max_age=settings.access_token_expire_minutes * 60,
        **common,
    )
    response.set_cookie(
        settings.vbx_refresh_cookie,
        refresh,
        max_age=settings.refresh_token_expire_days * 86400,
        **common,
    )
    # Non-HttpOnly double-submit CSRF companion (readable by JS / BFF).
    from app.core.middleware import issue_csrf_token

    response.set_cookie(
        "vbx_csrf",
        issue_csrf_token(),
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=False,
        samesite="lax",
        secure=settings.vbx_cookie_secure,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.vbx_access_cookie, path="/")
    response.delete_cookie(settings.vbx_refresh_cookie, path="/")
    response.delete_cookie("vbx_csrf", path="/")


def _issue_tokens(db: Session, user: User, request: Request, device_label: str) -> LoginResponse:
    ip, ua = _client_meta(request)
    _, is_new = track_login_session(
        db, user, device_label=device_label, user_agent=ua, ip_address=ip
    )
    write_audit(
        db,
        action="auth.login",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        details="new_device" if is_new else "known_device",
        ip_address=ip,
    )
    return LoginResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        is_new_device=is_new,
    )


@router.get("/session-mode", response_model=SessionModeOut)
def session_mode() -> SessionModeOut:
    return SessionModeOut(cookies=get_settings().auth_cookies_effective())


@router.post("/register", response_model=MessageOut)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)) -> MessageOut:
    rate_limit(request, "register", limit=10, window=300)
    exists = (
        db.query(User)
        .filter((User.username == payload.username) | (User.email == payload.email))
        .first()
    )
    if exists:
        # Avoid precise enumeration
        return MessageOut(
            message="Если данные корректны, заявка на регистрацию принята и ожидает подтверждения администратора."
        )

    viewer = db.query(Role).filter_by(code="viewer").one_or_none()
    user = User(
        username=payload.username,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        organization=payload.organization,
        title=payload.title,
        phone=payload.phone,
        status="pending",
        is_super_admin=False,
    )
    if viewer:
        user.roles.append(viewer)
    db.add(user)
    db.commit()
    ip, _ = _client_meta(request)
    write_audit(
        db,
        action="auth.register",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        details="pending",
        ip_address=ip,
    )
    return MessageOut(
        message="Регистрация принята. Вход будет доступен после подтверждения администратором."
    )


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    rate_limit(request, "login", limit=30, window=60)
    user = (
        db.query(User)
        .options(joinedload(User.roles))
        .filter((User.username == payload.username) | (User.email == payload.username))
        .one_or_none()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    if user.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись ожидает подтверждения администратором",
        )
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Учётная запись отключена")

    force_2fa = get_setting(db, "force_2fa", "false") == "true"
    if force_2fa and not user.totp_enabled and not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Администратор требует включить 2FA. Обратитесь к администратору после включения в профиле при следующем доступе.",
        )

    if user.totp_enabled:
        return LoginResponse(requires_2fa=True, temp_token=create_temp_2fa_token(str(user.id)))

    tokens = _issue_tokens(db, user, request, payload.device_label)
    if tokens.access_token and tokens.refresh_token:
        _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/login/2fa", response_model=LoginResponse)
def login_2fa(
    payload: TwoFAVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    rate_limit(request, "login2fa", limit=30, window=60)
    data = decode_token(payload.temp_token)
    if not data or data.get("type") != "2fa_pending":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный временный токен")
    user = db.get(User, int(data["sub"]))
    if not user or user.status != "active" or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2FA недоступна")

    code = payload.code.strip().replace(" ", "")
    ok = pyotp.TOTP(user.totp_secret).verify(code, valid_window=1)
    if not ok:
        for rc in db.query(RecoveryCode).filter_by(user_id=user.id, used_at=None).all():
            if verify_password(code, rc.code_hash):
                rc.used_at = utcnow()
                db.commit()
                ok = True
                break
    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный код 2FA")

    tokens = _issue_tokens(db, user, request, payload.device_label)
    if tokens.access_token and tokens.refresh_token:
        _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/refresh", response_model=LoginResponse)
def refresh_tokens(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    payload: RefreshRequest = Body(default_factory=RefreshRequest),
) -> LoginResponse:
    rate_limit(request, "refresh", limit=60, window=60)
    settings = get_settings()
    refresh_raw = (payload.refresh_token or "").strip()
    if not refresh_raw and settings.auth_cookies_effective():
        refresh_raw = request.cookies.get(settings.vbx_refresh_cookie) or ""
    if not refresh_raw or len(refresh_raw) < 10:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")
    data = decode_token(refresh_raw)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")
    try:
        user_id = int(data["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")
    user = (
        db.query(User)
        .options(joinedload(User.roles))
        .filter(User.id == user_id)
        .one_or_none()
    )
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия недействительна")
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    _set_auth_cookies(response, access, refresh)
    return LoginResponse(access_token=access, refresh_token=refresh)


@router.post("/logout", response_model=MessageOut)
def logout(response: Response) -> MessageOut:
    _clear_auth_cookies(response)
    return MessageOut(message="Выход выполнен")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_to_out(user)


@router.post("/change-password", response_model=MessageOut)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Текущий пароль неверен")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    ip, _ = _client_meta(request)
    write_audit(
        db,
        action="auth.change_password",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return MessageOut(message="Пароль обновлён")


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)) -> MessageOut:
    rate_limit(request, "forgot", limit=10, window=300)
    # Stub until SMTP (W6): always same response
    _ = db.query(User).filter_by(email=str(payload.email)).one_or_none()
    return MessageOut(
        message="Если адрес существует и SMTP настроен, инструкции по сбросу будут отправлены."
    )


@router.post("/2fa/setup", response_model=TotpSetupOut)
def totp_setup(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TotpSetupOut:
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled = False
    db.commit()
    issuer = "VBXSystem"
    url = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=issuer)
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return TotpSetupOut(secret=secret, otpauth_url=url, qr_png_base64=b64)


@router.post("/2fa/enable", response_model=TotpEnableOut)
def totp_enable(
    payload: TotpEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TotpEnableOut:
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Сначала вызовите /auth/2fa/setup")
    if not pyotp.TOTP(user.totp_secret).verify(payload.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Неверный код подтверждения")
    user.totp_enabled = True
    db.query(RecoveryCode).filter_by(user_id=user.id).delete()
    plain_codes: list[str] = []
    for _ in range(8):
        code = secrets.token_hex(4)
        plain_codes.append(code)
        db.add(RecoveryCode(user_id=user.id, code_hash=hash_password(code)))
    db.commit()
    ip, _ = _client_meta(request)
    write_audit(
        db,
        action="auth.2fa_enable",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return TotpEnableOut(recovery_codes=plain_codes, message="2FA включена. Сохраните коды восстановления.")


@router.post("/2fa/disable", response_model=MessageOut)
def totp_disable(
    payload: TotpEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    force = get_setting(db, "force_2fa", "false") == "true"
    if force and not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Администратор запретил отключение 2FA")
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA не включена")
    if not pyotp.TOTP(user.totp_secret).verify(payload.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Неверный код")
    user.totp_enabled = False
    user.totp_secret = None
    db.query(RecoveryCode).filter_by(user_id=user.id).delete()
    db.commit()
    ip, _ = _client_meta(request)
    write_audit(
        db,
        action="auth.2fa_disable",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return MessageOut(message="2FA отключена")
