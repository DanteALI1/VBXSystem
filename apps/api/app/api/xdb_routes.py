from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.core.config import get_settings
from app.core.rate_limit import rate_limit
from app.db import get_db
from app.models import User
from app.schemas import ExploitImportOut, ExploitListOut, MessageOut
from app.services.auth_helpers import write_audit
from app.services.xdb import (
    import_csv_content,
    import_json_content,
    import_records,
    list_exploits,
    seed_sample_exploits,
)

router = APIRouter(prefix="/xdb", tags=["xdb"])


class ExploitJsonImport(BaseModel):
    exploits: list[dict] = Field(default_factory=list)


@router.get("", response_model=ExploitListOut)
def xdb_list(
    q: str = Query(""),
    cve_id: str | None = Query(None),
    author: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    sort: str = Query("published"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ExploitListOut:
    data = list_exploits(
        db,
        q=q,
        cve_id=cve_id,
        author=author,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )
    return ExploitListOut(**data)


@router.post("/import/json", response_model=ExploitImportOut)
def xdb_import_json(
    body: ExploitJsonImport,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:sync")),
) -> ExploitImportOut:
    if not body.exploits:
        raise HTTPException(status_code=400, detail="Пустой список exploits")
    stats = import_records(db, body.exploits, source="json-import")
    write_audit(db, action="xdb.import_json", actor_user_id=user.id, resource="exploits", details=str(stats))
    return ExploitImportOut(message="Импорт JSON выполнен", **stats)


@router.post("/import/file", response_model=ExploitImportOut)
async def xdb_import_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:sync")),
) -> ExploitImportOut:
    rate_limit(request, "xdb_upload", limit=10, window=300)
    max_bytes = get_settings().vbx_max_xdb_upload_bytes
    raw = await file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Файл XDB превышает лимит {max_bytes // (1024 * 1024)} МБ",
        )
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл")
    name = (file.filename or "").lower()
    try:
        if name.endswith(".csv") or (file.content_type or "").endswith("csv"):
            stats = import_csv_content(db, raw, source="csv-import")
        elif name.endswith(".json") or "json" in (file.content_type or ""):
            stats = import_json_content(db, raw, source="json-import")
        else:
            # sniff
            text = raw[:32].lstrip()
            if text.startswith(b"[") or text.startswith(b"{"):
                stats = import_json_content(db, raw, source="json-import")
            else:
                stats = import_csv_content(db, raw, source="csv-import")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Ошибка импорта: {exc}") from exc
    write_audit(
        db,
        action="xdb.import_file",
        actor_user_id=user.id,
        resource=file.filename or "upload",
        details=str(stats),
    )
    return ExploitImportOut(message=f"Импорт «{file.filename}» выполнен", **stats)


@router.post("/import/sample", response_model=ExploitImportOut)
def xdb_import_sample(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("vuln:sync")),
) -> ExploitImportOut:
    stats = seed_sample_exploits(db)
    write_audit(db, action="xdb.import_sample", actor_user_id=user.id, resource="exploits", details=str(stats))
    return ExploitImportOut(message="Загружен демонстрационный набор XDB", **stats)


@router.get("/connector/stub", response_model=MessageOut)
def xdb_connector_stub(_: User = Depends(require_permissions("vuln:sync"))) -> MessageOut:
    return MessageOut(
        message="Коннектор внешней ленты XDB — заглушка. Используйте CSV/JSON import.",
    )
