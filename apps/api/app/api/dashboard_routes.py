from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db import get_db
from app.models import User
from app.schemas import DashboardOut, MessageOut
from app.services.dashboard import get_dashboard
from app.services import dashboard_layouts as layouts

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class LayoutWidgetIn(BaseModel):
    i: str
    type: str
    x: int = 0
    y: int = 0
    w: int = 4
    h: int = 2
    minW: int = 2
    minH: int = 2


class LayoutBodyIn(BaseModel):
    version: int = 1
    cols: int = 12
    widgets: list[LayoutWidgetIn] = []


class LayoutOut(BaseModel):
    id: int
    slug: str
    name: str
    is_system: bool
    user_id: int | None = None
    layout: dict
    created_at: str | None = None
    updated_at: str | None = None


class LayoutCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    layout: LayoutBodyIn | None = None
    source_id: int | None = None  # Save as from any loaded template


class LayoutUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    layout: LayoutBodyIn | None = None


class ActiveLayoutIn(BaseModel):
    layout_id: int


@router.get("", response_model=DashboardOut)
def dashboard(
    chart_range: str = Query("1M"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardOut:
    cr = (chart_range or "1M").upper()
    if cr not in {"1M", "6M", "1Y"}:
        cr = "1M"
    data = get_dashboard(db, chart_range=cr, user=user)
    return DashboardOut(**data)


@router.get("/layouts", response_model=list[LayoutOut])
def list_dashboard_layouts(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> list[LayoutOut]:
    return [LayoutOut(**layouts.layout_to_out(r)) for r in layouts.list_layouts(db, user)]


@router.get("/layouts/active", response_model=LayoutOut)
def get_active_dashboard_layout(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> LayoutOut:
    return LayoutOut(**layouts.layout_to_out(layouts.get_active_layout(db, user)))


@router.put("/layouts/active", response_model=LayoutOut)
def set_active_dashboard_layout(
    payload: ActiveLayoutIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> LayoutOut:
    try:
        row = layouts.set_active_layout(db, user, payload.layout_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return LayoutOut(**layouts.layout_to_out(row))


@router.post("/layouts", response_model=LayoutOut)
def create_dashboard_layout(
    payload: LayoutCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> LayoutOut:
    """Create personal template (Save as). May copy from source_id including Classic."""
    try:
        body = payload.layout.model_dump() if payload.layout else None
        row = layouts.create_personal(
            db,
            user,
            name=payload.name,
            layout=body,
            source_id=payload.source_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return LayoutOut(**layouts.layout_to_out(row))


@router.put("/layouts/{layout_id}", response_model=LayoutOut)
def update_dashboard_layout(
    layout_id: int,
    payload: LayoutUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> LayoutOut:
    try:
        body = payload.layout.model_dump() if payload.layout else None
        row = layouts.update_personal(
            db, user, layout_id, name=payload.name, layout=body
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return LayoutOut(**layouts.layout_to_out(row))


@router.delete("/layouts/{layout_id}", response_model=MessageOut)
def delete_dashboard_layout(
    layout_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> MessageOut:
    try:
        layouts.delete_personal(db, user, layout_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return MessageOut(message="Шаблон удалён")


@router.post("/layouts/{layout_id}/duplicate", response_model=LayoutOut)
def duplicate_dashboard_layout(
    layout_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:read")),
) -> LayoutOut:
    src = layouts.get_layout_for_user(db, user, layout_id)
    if not src:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    try:
        row = layouts.create_personal(
            db,
            user,
            name=f"{src.name} (копия)",
            source_id=src.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return LayoutOut(**layouts.layout_to_out(row))
