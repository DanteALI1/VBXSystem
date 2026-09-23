from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
)
from app.db import check_db, get_db
from app.models import User
from app.schemas import HealthResponse, LoginRequest, ReadyResponse, TokenResponse, UserOut

router = APIRouter()


def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        title=user.title,
        phone=user.phone,
        status=user.status,
        is_super_admin=user.is_super_admin,
        totp_enabled=user.totp_enabled,
        roles=[r.code for r in user.roles],
    )


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
def ready() -> ReadyResponse:
    db_ok = check_db()
    redis_ok = False
    try:
        import redis
        from app.core.config import get_settings

        settings = get_settings()
        client = redis.from_url(settings.vbx_redis_url)
        redis_ok = client.ping() is True
    except Exception:
        redis_ok = False

    status_val = "ok" if db_ok and redis_ok else "degraded"
    return ReadyResponse(status=status_val, database=db_ok, redis=redis_ok)


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = (
        db.query(User)
        .filter((User.username == payload.username) | (User.email == payload.username))
        .one_or_none()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись ожидает подтверждения или отключена",
        )
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )