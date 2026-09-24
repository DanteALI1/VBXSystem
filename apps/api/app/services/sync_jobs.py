from __future__ import annotations

import json
import os
import socket
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import SourceFile, SyncRun, utcnow
from app.services.auth_helpers import get_setting
from app.services.bdu_import import import_bdu_content
from app.services.epss_sync import run_epss_sync
from app.services.kev_sync import run_kev_sync
from app.services.nvd_sync import run_nvd_sync


def enqueue_sync(db: Session, source: str, *, created_by: int | None = None) -> SyncRun:
    run = SyncRun(
        source=source,
        status="pending",
        stats_json="{}",
        error="",
        created_by=created_by,
        created_at=utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _worker_id() -> str:
    return (os.environ.get("HOSTNAME") or socket.gethostname() or "worker")[:64]


def _nvd_should_resume(db: Session) -> bool:
    """Continue mirror from cursor unless catalog is marked complete and cursor reset."""
    try:
        cursor = int(get_setting(db, "nvd_mirror_cursor", "0") or "0")
    except ValueError:
        cursor = 0
    complete = get_setting(db, "nvd_mirror_complete", "false") == "true"
    return cursor > 0 and not complete


def process_sync_run(db: Session, run_id: int, *, lease_owner: str | None = None) -> SyncRun:
    run = db.get(SyncRun, run_id)
    if not run:
        raise ValueError("sync run not found")
    if run.status not in {"pending", "running"}:
        return run

    run.status = "running"
    run.started_at = utcnow()
    run.lease_owner = (lease_owner or _worker_id())[:64]
    run.leased_at = utcnow()
    db.commit()

    try:
        if run.source == "nvd":
            run_id_local = run.id

            def _nvd_progress(partial: dict) -> None:
                r = db.get(SyncRun, run_id_local)
                if not r:
                    return
                r.stats_json = json.dumps(partial, ensure_ascii=False)
                db.commit()

            resume = _nvd_should_resume(db)
            stats = run_nvd_sync(db, resume=resume, progress_cb=_nvd_progress)
            kev_stats = run_kev_sync(db, mock_fallback=True)
            stats["kev"] = kev_stats
            stats["resumed"] = resume
            if not stats.get("complete") and stats.get("mode") == "api":
                raise RuntimeError(
                    "NVD mirror не завершён: "
                    f"{stats.get('startIndex')}/{stats.get('totalResults')} "
                    f"errors={stats.get('errors')}"
                )
        elif run.source == "kev":
            stats = run_kev_sync(db, mock_fallback=True)
        elif run.source == "epss":
            stats = run_epss_sync(db)
        elif run.source == "bdu":
            src = (
                db.query(SourceFile)
                .filter(SourceFile.sync_run_id == run.id)
                .order_by(SourceFile.id.desc())
                .first()
            )
            if not src:
                raise RuntimeError("BDU source file missing")
            path = src.stored_path or ""
            if path.startswith("url:"):
                from app.core.config import get_settings
                from app.services.bdu_download import download_bdu_url

                url = path[4:]
                upload_root = Path(get_settings().vbx_upload_dir or "/app/uploads") / "bdu"
                upload_root.mkdir(parents=True, exist_ok=True)
                stamp = utcnow().strftime("%Y%m%d-%H%M%S")
                dest = upload_root / f"{stamp}-bdu-url.xlsx"
                size = download_bdu_url(url, dest, get_settings().vbx_max_bdu_upload_bytes)
                src.stored_path = str(dest)
                src.size_bytes = size
                src.filename = src.filename or "bdu-url.xlsx"
                db.commit()
                content = dest.read_bytes()
            else:
                content = Path(path).read_bytes()
            stats = import_bdu_content(db, content, filename=src.filename or "")
            if int(stats.get("parsed") or 0) == 0:
                raise RuntimeError("Файл БДУ не содержит распознанных записей")
        else:
            raise RuntimeError(f"Unknown source: {run.source}")

        if run.source == "nvd":
            errs = stats.get("errors") or []
            upserted = int(stats.get("upserted") or stats.get("created") or 0)
            if errs and upserted == 0 and stats.get("mode") == "api":
                raise RuntimeError("; ".join(str(e) for e in errs[:3]))

        run.stats_json = json.dumps(stats, ensure_ascii=False)
        run.status = "success"
        run.error = ""
        run.lease_owner = None
        run.leased_at = None
    except Exception as exc:
        db.rollback()
        run = db.get(SyncRun, run_id)
        if run:
            run.status = "failed"
            run.error = str(exc)[:4000]
            run.stats_json = json.dumps({"error": str(exc)[:2000]}, ensure_ascii=False)
            run.finished_at = utcnow()
            run.lease_owner = None
            run.leased_at = None
            db.commit()
            db.refresh(run)
        return run  # type: ignore[return-value]

    run.finished_at = utcnow()
    db.commit()
    db.refresh(run)
    return run


def _claim_one_pending(db: Session) -> SyncRun | None:
    """Claim a single pending SyncRun; Postgres uses SKIP LOCKED."""
    bind = db.get_bind()
    dialect = bind.dialect.name if bind is not None else ""
    owner = _worker_id()

    if dialect == "postgresql":
        row = db.execute(
            text(
                """
                SELECT id FROM sync_runs
                WHERE status = 'pending'
                ORDER BY id ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """
            )
        ).first()
        if not row:
            return None
        run = db.get(SyncRun, int(row[0]))
        if not run or run.status != "pending":
            return None
        run.status = "running"
        run.started_at = utcnow()
        run.lease_owner = owner
        run.leased_at = utcnow()
        db.commit()
        db.refresh(run)
        return run

    run = (
        db.query(SyncRun)
        .filter(SyncRun.status == "pending")
        .order_by(SyncRun.id.asc())
        .with_for_update()
        .first()
    )
    if not run:
        return None
    run.status = "running"
    run.started_at = utcnow()
    run.lease_owner = owner
    run.leased_at = utcnow()
    db.commit()
    db.refresh(run)
    return run


def process_pending_once(db: Session) -> int:
    from datetime import timedelta

    # Reclaim jobs stuck in "running" after crash (NVD full mirror can take hours).
    # Do NOT touch nvd_mirror_cursor — resume continues from checkpoint.
    stale_before = utcnow() - timedelta(hours=24)
    stale = (
        db.query(SyncRun)
        .filter(SyncRun.status == "running", SyncRun.started_at < stale_before)
        .order_by(SyncRun.id.asc())
        .limit(5)
        .all()
    )
    for run in stale:
        run.status = "pending"
        run.error = "requeued after stale running state"
        run.lease_owner = None
        run.leased_at = None
    if stale:
        db.commit()

    claimed = 0
    for _ in range(5):
        run = _claim_one_pending(db)
        if not run:
            break
        # Already marked running by claim; process without re-claim race
        process_sync_run(db, run.id, lease_owner=run.lease_owner)
        claimed += 1
    return claimed
