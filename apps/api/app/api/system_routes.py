"""Host/system metrics for Settings → Система (VULNEX-inspired)."""

from __future__ import annotations

import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/settings/system", tags=["system"])


class SystemMetricsOut(BaseModel):
    collected_at: str
    cpu: dict
    ram: dict
    swap: dict
    disk_root: dict
    disks: list[dict]


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if user.is_super_admin or any(r.code == "admin" for r in user.roles):
        return user
    raise HTTPException(status_code=403, detail="Недостаточно прав")


def collect_system_metrics() -> dict:
    try:
        import psutil
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(status_code=501, detail="psutil не установлен") from exc

    ram = psutil.virtual_memory()
    swap = psutil.swap_memory()
    disk = shutil.disk_usage("/")
    cpu = psutil.cpu_percent(interval=0.15)
    load = psutil.getloadavg() if hasattr(psutil, "getloadavg") else (0.0, 0.0, 0.0)
    disks: list[dict] = []
    for part in psutil.disk_partitions(all=False):
        try:
            u = psutil.disk_usage(part.mountpoint)
        except (PermissionError, OSError):
            continue
        disks.append(
            {
                "device": part.device,
                "mount": part.mountpoint,
                "fstype": part.fstype,
                "total": u.total,
                "used": u.used,
                "free": u.free,
                "percent": u.percent,
            }
        )
    return {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "cpu": {
            "percent": cpu,
            "count": psutil.cpu_count() or 1,
            "load_1": load[0],
            "load_5": load[1],
            "load_15": load[2],
        },
        "ram": {
            "total": ram.total,
            "used": ram.used,
            "available": ram.available,
            "percent": ram.percent,
        },
        "swap": {
            "total": swap.total,
            "used": swap.used,
            "free": swap.free,
            "percent": swap.percent,
        },
        "disk_root": {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent": round(disk.used * 100 / disk.total, 1) if disk.total else 0,
        },
        "disks": disks,
    }


@router.get("/metrics", response_model=SystemMetricsOut)
def system_metrics(
    _: User = Depends(_require_admin),
    __: Session = Depends(get_db),
) -> SystemMetricsOut:
    return SystemMetricsOut(**collect_system_metrics())
