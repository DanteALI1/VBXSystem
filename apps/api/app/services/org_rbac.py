"""Multi-BU org unit RBAC helpers."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import OrgUnit, User, utcnow, user_org_units


def list_org_units(db: Session) -> list[dict[str, Any]]:
    rows = db.query(OrgUnit).order_by(OrgUnit.name.asc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "parent_id": r.parent_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def create_org_unit(db: Session, *, name: str, parent_id: int | None = None) -> dict[str, Any]:
    nm = (name or "").strip()[:255]
    if not nm:
        raise ValueError("name required")
    row = OrgUnit(name=nm, parent_id=parent_id, created_at=utcnow())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "parent_id": row.parent_id, "created_at": row.created_at.isoformat()}


def delete_org_unit(db: Session, unit_id: int) -> None:
    row = db.get(OrgUnit, unit_id)
    if not row:
        raise LookupError("Org unit not found")
    db.delete(row)
    db.commit()


def user_org_unit_ids(db: Session, user: User) -> set[int]:
    if user.is_super_admin:
        return set()
    rows = db.execute(
        user_org_units.select().where(user_org_units.c.user_id == user.id)
    ).fetchall()
    return {int(r.org_unit_id) for r in rows}


def set_user_org_units(db: Session, user_id: int, unit_ids: list[int]) -> list[int]:
    db.execute(user_org_units.delete().where(user_org_units.c.user_id == user_id))
    clean = sorted({int(x) for x in unit_ids if x})
    for uid in clean:
        db.execute(user_org_units.insert().values(user_id=user_id, org_unit_id=uid))
    db.commit()
    return clean


def can_see_org_unit(user: User, unit_ids: set[int], org_unit_id: int | None) -> bool:
    if user.is_super_admin:
        return True
    if not unit_ids:
        # no assignments → see unassigned only
        return org_unit_id is None
    if org_unit_id is None:
        return True  # unassigned visible
    return org_unit_id in unit_ids


def assert_asset_visible(db: Session, user: User, asset: Any | None) -> None:
    """Raise PermissionError if user cannot see asset's org unit."""
    if user.is_super_admin:
        return
    unit_ids = user_org_unit_ids(db, user)
    org_unit_id = getattr(asset, "org_unit_id", None) if asset is not None else None
    if not can_see_org_unit(user, unit_ids, org_unit_id):
        raise PermissionError("Нет доступа к этому орг. юниту")


def assert_finding_visible(db: Session, user: User, finding: Any) -> None:
    if user.is_super_admin:
        return
    asset = None
    if getattr(finding, "asset_id", None):
        from app.models import Asset

        asset = db.get(Asset, finding.asset_id)
    assert_asset_visible(db, user, asset)
