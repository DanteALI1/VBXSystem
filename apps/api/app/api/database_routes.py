from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.rate_limit import rate_limit
from app.db import get_db
from app.models import BduRecord, CisaKev, CveRecord, SourceFile, SyncRun, User, utcnow
from app.schemas import (
    AutoUpdateUpdate,
    BduUploadOut,
    BduUrlUpdate,
    CveStoreRawJsonUpdate,
    DatabaseSettingsOut,
    DatabaseStatsOut,
    MessageOut,
    NvdKeyUpdate,
    PruneRawJsonIn,
    SyncRunOut,
    SyncStartOut,
)
from app.services.auth_helpers import get_setting, set_setting, write_audit
from app.services.crypto_secrets import decrypt_secret, encrypt_secret, mask_secret
from app.services.nvd_sync import prune_huge_raw_json, store_raw_json_enabled
from app.services.sync_jobs import enqueue_sync

router = APIRouter(prefix="/settings/database", tags=["database"])

CHUNK = 1024 * 1024
DEFAULT_BDU_URL = "https://bdu.fstec.ru/files/documents/vullist.xlsx"


def _download_bdu_url(url: str, dest: Path, max_bytes: int) -> int:
    from fastapi import HTTPException

    from app.services.bdu_download import BduDownloadError, download_bdu_url

    try:
        return download_bdu_url(url, dest, max_bytes)
    except BduDownloadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def _upload_root() -> Path:
    raw = get_settings().vbx_upload_dir or "/app/uploads"
    return Path(raw) / "bdu"


def _user_can_manage_db(user: User) -> bool:
    if user.is_super_admin:
        return True
    perms = {p.code for r in user.roles for p in r.permissions}
    return "vuln:sync" in perms or "settings:write" in perms


def _require_db_admin(user: User = Depends(get_current_user)) -> User:
    if not _user_can_manage_db(user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return user


def _last_sync(db: Session, source: str) -> SyncRun | None:
    """Latest run for source (any status) so UI can show failures."""
    return (
        db.query(SyncRun)
        .filter(SyncRun.source == source)
        .order_by(SyncRun.id.desc())
        .first()
    )


def _sync_out(run: SyncRun | None) -> SyncRunOut | None:
    if not run:
        return None
    try:
        stats = json.loads(run.stats_json or "{}")
    except json.JSONDecodeError:
        stats = {}
    return SyncRunOut(
        id=run.id,
        source=run.source,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        stats=stats,
        error=run.error or "",
    )


def _build_settings(db: Session) -> DatabaseSettingsOut:
    enc = get_setting(db, "nvd_api_key_enc", "")
    plain = decrypt_secret(enc)
    auto = get_setting(db, "nvd_auto_update", "true") == "true"
    interval = get_setting(db, "nvd_auto_interval_hours", "2")
    mock = get_setting(db, "nvd_mock_mode", "true" if not plain else "false") == "true"

    cve_count = db.query(func.count(CveRecord.id)).scalar() or 0
    bdu_count = db.query(func.count(BduRecord.id)).scalar() or 0
    bdu_standalone = (
        db.query(func.count(BduRecord.id)).filter(BduRecord.is_standalone.is_(True)).scalar() or 0
    )
    bdu_mapped = bdu_count - bdu_standalone
    kev_count = db.query(func.count(CisaKev.cve_id)).scalar() or 0

    last_nvd = _last_sync(db, "nvd")
    last_bdu = _last_sync(db, "bdu")
    last_kev = _last_sync(db, "kev")

    stored_bdu_url = get_setting(db, "bdu_xml_url", DEFAULT_BDU_URL)
    # Old default vulxml.xml is gone (404) — auto-migrate to current FSTEC xlsx
    if "vulxml.xml" in (stored_bdu_url or ""):
        set_setting(db, "bdu_xml_url", DEFAULT_BDU_URL)
        stored_bdu_url = DEFAULT_BDU_URL

    nvd_stats: dict = {}
    if last_nvd:
        try:
            nvd_stats = json.loads(last_nvd.stats_json or "{}")
        except json.JSONDecodeError:
            nvd_stats = {}

    return DatabaseSettingsOut(
        nvd_api_key_masked=mask_secret(plain) if plain else "",
        nvd_api_key_configured=bool(plain),
        nvd_auto_update=auto,
        nvd_auto_interval_hours=int(interval or "2"),
        nvd_mock_mode=mock,
        bdu_xml_url=stored_bdu_url or DEFAULT_BDU_URL,
        cve_store_raw_json=store_raw_json_enabled(db),
        last_nvd_sync=_sync_out(last_nvd),
        last_bdu_sync=_sync_out(last_bdu),
        last_kev_sync=_sync_out(last_kev),
        stats=DatabaseStatsOut(
            db_version="v0.9.0",
            cve_count=cve_count,
            bdu_count=bdu_count,
            bdu_mapped=bdu_mapped,
            bdu_standalone=bdu_standalone,
            kev_count=kev_count,
            nvd_mirror_status="Актуален" if last_nvd else "Не синхронизирован",
            cache_label="—",
            size_label="—",
            last_nvd_new=int(nvd_stats.get("upserted") or nvd_stats.get("created") or 0),
            last_kev_matches=int((nvd_stats.get("kev") or {}).get("matched_cves") or 0),
        ),
    )


@router.get("", response_model=DatabaseSettingsOut)
def get_database_settings(
    db: Session = Depends(get_db),
    _: User = Depends(_require_db_admin),
) -> DatabaseSettingsOut:
    return _build_settings(db)


@router.put("/nvd-key", response_model=MessageOut)
def set_nvd_key(
    payload: NvdKeyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> MessageOut:
    set_setting(db, "nvd_api_key_enc", encrypt_secret(payload.api_key.strip()))
    set_setting(db, "nvd_mock_mode", "false" if payload.api_key.strip() else "true")
    write_audit(db, action="database.nvd_key_set", actor_user_id=user.id, resource="nvd")
    return MessageOut(message="API ключ NVD сохранён")


@router.put("/nvd-auto-update", response_model=MessageOut)
def set_auto_update(
    payload: AutoUpdateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> MessageOut:
    set_setting(db, "nvd_auto_update", "true" if payload.enabled else "false")
    write_audit(
        db,
        action="database.nvd_auto_update",
        actor_user_id=user.id,
        details=str(payload.enabled),
    )
    return MessageOut(message="Автообновление NVD обновлено")


@router.put("/cve-store-raw-json", response_model=MessageOut)
def set_cve_store_raw_json(
    payload: CveStoreRawJsonUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> MessageOut:
    set_setting(db, "cve_store_raw_json", "true" if payload.enabled else "false")
    write_audit(
        db,
        action="database.cve_store_raw_json",
        actor_user_id=user.id,
        details=str(payload.enabled),
    )
    return MessageOut(
        message=(
            "Хранение raw_json включено"
            if payload.enabled
            else "Хранение raw_json отключено (новые sync пишут stub)"
        )
    )


@router.post("/prune-raw-json", response_model=MessageOut)
def prune_raw_json(
    payload: PruneRawJsonIn,
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> MessageOut:
    if not payload.confirm:
        raise HTTPException(
            status_code=400,
            detail="Передайте confirm=true — операция необратимо обрезает крупные raw_json",
        )
    result = prune_huge_raw_json(
        db,
        min_bytes=max(1000, int(payload.min_bytes or 10_000)),
        limit=max(1, min(int(payload.limit or 50_000), 200_000)),
    )
    write_audit(
        db,
        action="database.prune_raw_json",
        actor_user_id=user.id,
        details=str(result),
    )
    return MessageOut(message=f"Обрезано raw_json: {result['updated']} записей")


@router.post("/sync/nvd", response_model=SyncStartOut)
def start_nvd_sync(
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> SyncStartOut:
    run = enqueue_sync(db, "nvd", created_by=user.id)
    # Leave pending for worker — avoids blocking HTTP on multi-page NVD pull
    write_audit(db, action="database.sync_nvd", actor_user_id=user.id, resource=f"sync:{run.id}")
    return SyncStartOut(
        run=_sync_out(run),
        message=(
            "Полная синхронизация NVD поставлена в очередь (worker). "
            "Зеркало ~400k CVE занимает обычно 1–3 часа — смотрите статус и счётчик CVE на этой странице."
        ),
    )


@router.post("/sync/kev", response_model=SyncStartOut)
def start_kev_sync(
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> SyncStartOut:
    run = enqueue_sync(db, "kev", created_by=user.id)
    write_audit(db, action="database.sync_kev", actor_user_id=user.id, resource=f"sync:{run.id}")
    return SyncStartOut(
        run=_sync_out(run),
        message="Синхронизация CISA KEV поставлена в очередь (worker).",
    )


@router.post("/bdu/upload", response_model=BduUploadOut)
async def upload_bdu(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> BduUploadOut:
    rate_limit(request, "bdu_upload", limit=5, window=300)
    name = file.filename or "bdu.xml"
    lower = name.lower()
    if not (lower.endswith(".xml") or lower.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Поддерживаются XML и XLSX выгрузки БДУ")
    # Path traversal / odd names
    safe_name = Path(name).name
    if safe_name != name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Некорректное имя файла")

    max_bytes = get_settings().vbx_max_bdu_upload_bytes
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            # multipart overhead; still reject obviously huge bodies early
            if int(cl) > max_bytes + (1024 * 1024):
                raise HTTPException(
                    status_code=413,
                    detail=f"Файл БДУ превышает лимит {max_bytes // (1024 * 1024)} МБ",
                )
        except ValueError:
            pass

    upload_root = _upload_root()
    upload_root.mkdir(parents=True, exist_ok=True)
    run = enqueue_sync(db, "bdu", created_by=user.id)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = upload_root / f"{stamp}-{safe_name}"
    written = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(CHUNK)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Файл БДУ превышает лимит {max_bytes // (1024 * 1024)} МБ",
                    )
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    db.add(
        SourceFile(
            source="bdu",
            filename=safe_name,
            stored_path=str(dest),
            size_bytes=written,
            sync_run_id=run.id,
            created_at=utcnow(),
        )
    )
    db.commit()

    # Import in worker — large XLSX can take minutes
    write_audit(db, action="database.bdu_upload", actor_user_id=user.id, resource=safe_name)
    run = db.get(SyncRun, run.id)
    return BduUploadOut(
        run=_sync_out(run),
        message="Файл БДУ загружен, импорт выполняется в фоне (worker).",
        filename=safe_name,
    )


@router.put("/bdu-url", response_model=MessageOut)
def set_bdu_url(
    payload: BduUrlUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> MessageOut:
    url = (payload.bdu_xml_url or "").strip()
    set_setting(db, "bdu_xml_url", url)
    write_audit(db, action="database.bdu_url_set", actor_user_id=user.id, details=url[:200])
    return MessageOut(message="URL выгрузки БДУ сохранён")


@router.post("/sync/bdu-url", response_model=BduUploadOut)
def sync_bdu_from_url(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
) -> BduUploadOut:
    """Download BDU XML/XLSX from configured URL and queue import."""
    rate_limit(request, "bdu_url_sync", limit=3, window=600)

    url = get_setting(db, "bdu_xml_url", DEFAULT_BDU_URL).strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Задайте корректный http(s) URL БДУ")

    run = enqueue_sync(db, "bdu", created_by=user.id)
    fname = "bdu-url.xlsx" if ".xlsx" in url.lower() else "bdu-url.xml"
    # Defer download to worker — API only enqueues (avoids blocking uvicorn on 30MB+)
    db.add(
        SourceFile(
            source="bdu",
            filename=fname,
            stored_path=f"url:{url}",
            size_bytes=0,
            sync_run_id=run.id,
            created_at=utcnow(),
        )
    )
    db.commit()
    write_audit(db, action="database.bdu_url_sync", actor_user_id=user.id, resource=url[:200])
    run = db.get(SyncRun, run.id)
    return BduUploadOut(
        run=_sync_out(run),
        message="Загрузка БДУ поставлена в очередь: worker скачает файл и выполнит импорт.",
        filename=fname,
    )


@router.get("/export/cves")
def export_cves(
    db: Session = Depends(get_db),
    user: User = Depends(_require_db_admin),
):
    _ = user
    rows = db.query(CveRecord).order_by(CveRecord.id).limit(5000).all()
    payload = [
        {
            "id": r.id,
            "description": r.description,
            "cvss_score": r.cvss_score,
            "cvss_severity": r.cvss_severity,
            "is_cisa_kev": r.is_cisa_kev,
            "published_at": r.published_at.isoformat() if r.published_at else None,
        }
        for r in rows
    ]
    return JSONResponse(payload)
