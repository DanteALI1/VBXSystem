from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import DashboardOut
from app.services.dashboard import get_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    chart_range: str = Query("1M"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardOut:
    cr = (chart_range or "1M").upper()
    if cr not in {"1M", "6M", "1Y"}:
        cr = "1M"
    data = get_dashboard(db, chart_range=cr)
    return DashboardOut(**data)
