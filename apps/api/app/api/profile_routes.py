from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.serializers import user_to_out
from app.core.security import hash_password
from app.db import get_db
from app.models import User
from app.schemas import ChangePasswordRequest, MessageOut, ProfileUpdate, UserOut
from app.services.auth_helpers import write_audit

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserOut)
def get_profile(user: User = Depends(get_current_user)) -> UserOut:
    return user_to_out(user)


@router.patch("", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        other = db.query(User).filter(User.email == str(data["email"]), User.id != user.id).first()
        if other:
            raise HTTPException(status_code=400, detail="Email уже используется")
        user.email = str(data["email"])
    for field in ("full_name", "organization", "title", "phone"):
        if field in data and data[field] is not None:
            setattr(user, field, data[field])
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
        action="profile.update",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return user_to_out(user)


@router.post("/change-password", response_model=MessageOut)
def profile_change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    from app.core.security import verify_password

    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Текущий пароль неверен")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="profile.change_password",
        actor_user_id=user.id,
        resource=f"user:{user.id}",
        ip_address=ip,
    )
    return MessageOut(message="Пароль обновлён")
