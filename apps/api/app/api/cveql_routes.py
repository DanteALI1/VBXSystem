"""CVEQL execute + CSV export."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, user_permissions
from app.core.rate_limit import rate_limit
from app.db import get_db
from app.models import User
from app.schemas import CveqlExecuteOut, CveqlHelpOut
from app.services.csv_export import dicts_to_csv
from app.services.cveql_exec import CVEQL_EXAMPLES, execute_cveql
from app.services.cveql_parser import ALLOWED_FIELDS, CveqlParseError

router = APIRouter(prefix="/cveql", tags=["cveql"])


class CveqlExecuteIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)


class CveqlExportIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(2000, ge=1, le=5000)


def _cveql_rate_limit(request: Request, user: User) -> None:
    perms = user_permissions(user)
    if user.is_super_admin or "admin" in {r.code for r in user.roles} or "*" in perms:
        limit = 60
    elif "analyst" in {r.code for r in user.roles} or "vuln:read" in perms:
        limit = 30
    else:
        limit = 10
    rate_limit(request, f"cveql:u{user.id}", limit=limit, window=60)


@router.get("/help", response_model=CveqlHelpOut)
def cveql_help(_: User = Depends(get_current_user)) -> CveqlHelpOut:
    return CveqlHelpOut(
        fields=sorted(ALLOWED_FIELDS.keys()),
        operators=["=", "!=", ">", ">=", "<", "<=", "~", "in", "and", "or"],
        examples=CVEQL_EXAMPLES,
        notes=(
            "Подмножество CVEQL: сравнения и and/or/in/~. "
            "Запросы компилируются в SQLAlchemy (без сырого SQL). "
            "Лимит частоты зависит от роли. "
            "Поля affected.app / affected.os / affected.version: "
            "version — всегда версии уязвимого ПО (приложения), не ОС."
        ),
    )


@router.post("/execute", response_model=CveqlExecuteOut)
def cveql_execute(
    body: CveqlExecuteIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CveqlExecuteOut:
    _cveql_rate_limit(request, user)
    try:
        data = execute_cveql(db, body.query, limit=body.limit, offset=body.offset)
    except CveqlParseError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"Ошибка выполнения: {exc}") from exc
    return CveqlExecuteOut(**data)


_CSV_HEADERS = (
    "id",
    "title",
    "severity",
    "cvss_score",
    "published",
    "is_cisa_kev",
    "has_bdu",
    "epss_score",
    "epss_percentile",
    "affected_app",
    "affected_os",
    "affected_version",
    "href",
)


@router.post("/export")
def cveql_export_csv(
    body: CveqlExportIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _cveql_rate_limit(request, user)
    try:
        data = execute_cveql(db, body.query, limit=body.limit, offset=0)
    except CveqlParseError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"Ошибка выполнения: {exc}") from exc

    rows = []
    for r in data.get("results") or []:
        rows.append(
            {
                "id": r.get("id"),
                "title": r.get("title"),
                "severity": r.get("severity"),
                "cvss_score": r.get("cvss_score"),
                "published": r.get("published"),
                "is_cisa_kev": r.get("is_cisa_kev"),
                "has_bdu": r.get("has_bdu"),
                "epss_score": r.get("epss_score"),
                "epss_percentile": r.get("epss_percentile"),
                "affected_app": r.get("affected_app"),
                "affected_os": r.get("affected_os"),
                "affected_version": r.get("affected_version"),
                "href": r.get("href"),
            }
        )
    csv_text = dicts_to_csv(_CSV_HEADERS, rows)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="cveql-export.csv"'},
    )
