from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.security import decode_token
from app.db import get_db
from app.models import Role, User
from app.services.api_keys import key_scopes, resolve_api_key


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> User:
    raw_key = None
    if x_api_key:
        raw_key = x_api_key.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token.startswith("vbx_"):
            raw_key = token
        else:
            payload = decode_token(token)
            if not payload or payload.get("type") != "access":
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
            user_id = payload.get("sub")
            user = (
                db.query(User)
                .options(
                    joinedload(User.roles).joinedload(Role.permissions),
                    joinedload(User.groups),
                )
                .filter(User.id == int(user_id))
                .one_or_none()
                if user_id
                else None
            )
            if not user or user.status != "active":
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь недоступен")
            return user

    if raw_key:
        api_key = resolve_api_key(db, raw_key)
        if not api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный API-ключ")
        user = (
            db.query(User)
            .options(
                joinedload(User.roles).joinedload(Role.permissions),
                joinedload(User.groups),
            )
            .filter(User.id == api_key.owner_user_id)
            .one_or_none()
        )
        if not user or user.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Владелец ключа недоступен")
        # stash scopes on user object for require_permissions
        user._api_key_scopes = key_scopes(api_key)  # type: ignore[attr-defined]
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
        # API key auth must satisfy scopes explicitly (even for super_admin owners)
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
