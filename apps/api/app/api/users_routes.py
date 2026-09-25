from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_super_admin
from app.api.serializers import user_to_out
from app.core.security import hash_password
from app.db import get_db
from app.models import Group, Role, User
from app.schemas import (
    MessageOut,
    RoleOut,
    UserCreateRequest,
    UserOut,
    UserUpdateRequest,
)
from app.services.auth_helpers import write_audit

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/meta/roles", response_model=list[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> list[RoleOut]:
    roles = db.query(Role).order_by(Role.code).all()
    return [RoleOut(code=r.code, name=r.name, description=r.description) for r in roles]


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> list[UserOut]:
    users = db.query(User).options(joinedload(User.roles), joinedload(User.groups)).order_by(User.id).all()
    return [user_to_out(u) for u in users]


@router.post("", response_model=UserOut)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
) -> UserOut:
    if db.query(User).filter((User.username == payload.username) | (User.email == str(payload.email))).first():
        raise HTTPException(status_code=400, detail="Пользователь с таким логином или email уже есть")
    user = User(
        username=payload.username,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        organization=payload.organization,
        title=payload.title,
        phone=payload.phone,
        status=payload.status if payload.status in {"pending", "active", "disabled"} else "active",
    )
    roles = db.query(Role).filter(Role.code.in_(payload.roles or ["viewer"])).all()
    user.roles = roles
    if payload.group_ids:
        user.groups = db.query(Group).filter(Group.id.in_(payload.group_ids)).all()
    db.add(user)
    db.commit()
    db.refresh(user)
    user = (
        db.query(User)
        .options(joinedload(User.roles), joinedload(User.groups))
        .filter(User.id == user.id)
        .one()
    )
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="users.create",
        actor_user_id=admin.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return user_to_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
) -> UserOut:
    user = (
        db.query(User)
        .options(joinedload(User.roles), joinedload(User.groups))
        .filter(User.id == user_id)
        .one_or_none()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        other = db.query(User).filter(User.email == str(data["email"]), User.id != user.id).first()
        if other:
            raise HTTPException(status_code=400, detail="Email уже используется")
        user.email = str(data["email"])
    for field in ("full_name", "organization", "title", "phone"):
        if field in data and data[field] is not None:
            setattr(user, field, data[field])
    if "status" in data and data["status"] in {"pending", "active", "disabled"}:
        user.status = data["status"]
    if "roles" in data and data["roles"] is not None:
        roles = db.query(Role).filter(Role.code.in_(data["roles"])).all()
        user.roles = roles
    if "group_ids" in data and data["group_ids"] is not None:
        groups = db.query(Group).filter(Group.id.in_(data["group_ids"])).all()
        user.groups = groups
    db.commit()
    user = (
        db.query(User)
        .options(joinedload(User.roles), joinedload(User.groups))
        .filter(User.id == user_id)
        .one()
    )
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="users.update",
        actor_user_id=admin.id,
        resource=f"user:{user.id}",
        details=str(data.keys()),
        ip_address=ip,
    )
    return user_to_out(user)


@router.post("/{user_id}/approve", response_model=UserOut)
def approve_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.status = "active"
    db.commit()
    user = (
        db.query(User)
        .options(joinedload(User.roles), joinedload(User.groups))
        .filter(User.id == user_id)
        .one()
    )
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="users.approve",
        actor_user_id=admin.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return user_to_out(user)


@router.post("/{user_id}/reject", response_model=MessageOut)
def reject_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
) -> MessageOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.is_super_admin:
        raise HTTPException(status_code=400, detail="Нельзя отклонить главного администратора")
    user.status = "disabled"
    db.commit()
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="users.reject",
        actor_user_id=admin.id,
        resource=f"user:{user_id}",
        ip_address=ip,
    )
    return MessageOut(message="Регистрация отклонена, пользователь отключён")
