from app.api.deps import user_permissions
from app.models import User
from app.schemas import UserOut


def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name or "",
        organization=user.organization or "",
        title=user.title or "",
        phone=user.phone or "",
        status=user.status,
        is_super_admin=user.is_super_admin,
        totp_enabled=user.totp_enabled,
        roles=[r.code for r in user.roles],
        groups=[g.name for g in user.groups],
        permissions=sorted(user_permissions(user)),
    )
