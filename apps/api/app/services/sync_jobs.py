from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import SourceFile, SyncRun, utcnow
from app.services.bdu_import import import_bdu_xml_content
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


def process_sync_run(db: Session, run_id: int) -> SyncRun:
    run = db.get(SyncRun, run_id)
    if not run:
        raise ValueError("sync run not found")
    if run.status not in {"pending", "running"}:
        return run

    run.status = "running"
    run.started_at = utcnow()
    db.commit()

    try:
        if run.source == "nvd":
            stats = run_nvd_sync(db)
            # also refresh kev flags lightly
            kev_stats = run_kev_sync(db, mock_fallback=True)
            stats["kev"] = kev_stats
        elif run.source == "kev":
            stats = run_kev_sync(db, mock_fallback=True)
        elif run.source == "bdu":
            src = (
                db.query(SourceFile)
                .filter(SourceFile.sync_run_id == run.id)
                .order_by(SourceFile.id.desc())
                .first()
            )
            if not src:
                raise RuntimeError("BDU source file missing")
            content = Path(src.stored_path).read_bytes()
            stats = import_bdu_xml_content(db, content)
        else:
            raise RuntimeError(f"Unknown source: {run.source}")

        run.stats_json = json.dumps(stats, ensure_ascii=False)
        run.status = "success"
        run.error = ""
    except Exception as exc:
        run.status = "failed"
        run.error = str(exc)
        run.stats_json = json.dumps({"error": str(exc)})
    run.finished_at = utcnow()
    db.commit()
    db.refresh(run)
    return run


def process_pending_once(db: Session) -> int:
    pending = (
        db.query(SyncRun)
        .filter(SyncRun.status == "pending")
        .order_by(SyncRun.id.asc())
        .limit(5)
        .all()
    )
    for run in pending:
        process_sync_run(db, run.id)
    return len(pending)
