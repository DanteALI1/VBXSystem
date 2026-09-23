from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.security import decode_token
from app.db import get_db
from app.models import Role, User


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")
    token = authorization.split(" ", 1)[1].strip()
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


def user_permissions(user: User) -> set[str]:
    perms: set[str] = set()
    if user.is_super_admin:
        return {"*"}
    for role in user.roles:
        for p in role.permissions:
            perms.add(p.code)
    return perms


def require_permissions(*codes: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.is_super_admin:
            return user
        have = user_permissions(user)
        missing = [c for c in codes if c not in have]
        if missing:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return user

    return _dep


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только для главного администратора")
    return user
