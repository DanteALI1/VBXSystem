from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.security import decode_token
from app.db import get_db
from app.models import Role, User
from app.services.api_keys import key_scopes, resolve_api_key


def _load_user(db: Session, user_id: int) -> User | None:
    return (
        db.query(User)
        .options(
            joinedload(User.roles).joinedload(Role.permissions),
            joinedload(User.groups),
        )
        .filter(User.id == user_id)
        .one_or_none()
    )


def _user_from_access_jwt(db: Session, token: str) -> User | None:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return None
    user = _load_user(db, uid)
    if not user or user.status != "active":
        return None
    return user


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> User:
    settings = get_settings()

    if x_api_key:
        raw_key = x_api_key.strip()
        api_key = resolve_api_key(db, raw_key)
        if not api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный API-ключ")
        user = _load_user(db, api_key.owner_user_id)
        if not user or user.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Владелец ключа недоступен")
        user._api_key_scopes = key_scopes(api_key)  # type: ignore[attr-defined]
        return user

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token.startswith("vbx_"):
            api_key = resolve_api_key(db, token)
            if not api_key:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный API-ключ")
            user = _load_user(db, api_key.owner_user_id)
            if not user or user.status != "active":
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Владелец ключа недоступен")
            user._api_key_scopes = key_scopes(api_key)  # type: ignore[attr-defined]
            return user
        user = _user_from_access_jwt(db, token)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
        return user

    if settings.auth_cookies_effective():
        cookie = request.cookies.get(settings.vbx_access_cookie)
        if cookie:
            user = _user_from_access_jwt(db, cookie)
            if user:
                return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")


def user_permissions(user: User) -> set[str]:
    if getattr(user, "_api_key_scopes", None) is not None:
        return set(user._api_key_scopes)  # type: ignore[attr-defined]
    perms: set[str] = set()
    if user.is_super_admin:
        return {"*"}
    for role in user.roles:
        for p in role.permissions:
            perms.add(p.code)
    return perms


def require_permissions(*codes: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        have = user_permissions(user)
        if "*" in have:
            return user
        if getattr(user, "_api_key_scopes", None) is not None:
            missing = [c for c in codes if c not in have]
            if missing:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав API-ключа")
            return user
        if user.is_super_admin:
            return user
        missing = [c for c in codes if c not in have]
        if missing:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return user

    return _dep


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if getattr(user, "_api_key_scopes", None) is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API-ключ не может выполнять это действие")
    if not user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только для главного администратора")
    return user
