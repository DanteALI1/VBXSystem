from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import require_super_admin
from app.db import get_db
from app.models import Group, User
from app.schemas import AdGroupSyncOut, AdGroupSyncRequest, GroupCreateRequest, GroupOut, MessageOut
from app.services.auth_helpers import write_audit

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[GroupOut])
def list_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> list[GroupOut]:
    return list(db.query(Group).order_by(Group.name).all())


@router.post("", response_model=GroupOut)
def create_group(
    payload: GroupCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
) -> GroupOut:
    if payload.source not in {"local", "ad"}:
        raise HTTPException(status_code=400, detail="source должен быть local или ad")
    if db.query(Group).filter_by(name=payload.name).first():
        raise HTTPException(status_code=400, detail="Группа уже существует")
    group = Group(
        name=payload.name,
        description=payload.description,
        source=payload.source,
        external_id=payload.external_id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="groups.create",
        actor_user_id=admin.id,
        resource=f"group:{group.id}",
        ip_address=ip,
    )
    return group


@router.delete("/{group_id}", response_model=MessageOut)
def delete_group(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
) -> MessageOut:
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    db.delete(group)
    db.commit()
    ip = request.client.host if request.client else None
    write_audit(
        db,
        action="groups.delete",
        actor_user_id=admin.id,
        resource=f"group:{group_id}",
        ip_address=ip,
    )
    return MessageOut(message="Группа удалена")


@router.post("/ad/sync", response_model=AdGroupSyncOut)
def sync_ad_groups(
    payload: AdGroupSyncRequest,
    _: User = Depends(require_super_admin),
) -> AdGroupSyncOut:
    # Contract stub for W6 LDAP integration
    return AdGroupSyncOut(
        status="not_configured",
        message="Синхронизация AD/LDAP будет доступна в волне интеграций (W6). Контракт API готов.",
        planned=[
            {"name": "Domain Users", "external_id": "cn=Domain Users", "source": "ad"},
            {"name": "VBX Analysts", "external_id": "cn=VBX Analysts", "source": "ad"},
        ]
        if payload.dry_run
        else [],
    )
