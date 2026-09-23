from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, user_permissions
from app.core.rate_limit import rate_limit
from app.db import get_db
from app.models import User
from app.schemas import CveqlExecuteOut, CveqlHelpOut
from app.services.cveql_exec import CVEQL_EXAMPLES, execute_cveql
from app.services.cveql_parser import ALLOWED_FIELDS, CveqlParseError

router = APIRouter(prefix="/cveql", tags=["cveql"])


class CveqlExecuteIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)


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
            "Лимит частоты зависит от роли."
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
