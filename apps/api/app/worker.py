"""Background worker: sync_runs and/or ops (schedules, alerts).

Modes via VBX_WORKER_MODE:
  sync — process pending sync_runs (default; existing behaviour)
  ops  — tick schedules + drain alert_outbox
  all  — both in one process (dev convenience)
"""

from __future__ import annotations

import os
import time

from sqlalchemy import text

from app.db import SessionLocal
from app.services.ops_jobs import process_ops_once
from app.services.sync_jobs import process_pending_once


def _wait_for_migrations() -> None:
    for i in range(90):
        db = SessionLocal()
        try:
            ver = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
            if ver:
                print(f"[vbx-worker] migrations ready: {ver}")
                return
        except Exception as exc:
            print(f"[vbx-worker] waiting for API migrations ({i}): {exc}")
        finally:
            db.close()
        time.sleep(2)
    raise RuntimeError("alembic_version not ready — start API first")


def main() -> None:
    mode = (os.environ.get("VBX_WORKER_MODE") or "sync").strip().lower()
    print(f"[vbx-worker] started mode={mode}")
    _wait_for_migrations()
    while True:
        db = SessionLocal()
        try:
            n = 0
            if mode in ("sync", "all"):
                n += process_pending_once(db) or 0
            if mode in ("ops", "all"):
                n += process_ops_once(db) or 0
            if n:
                print(f"[vbx-worker] processed {n} unit(s)")
        except Exception as exc:  # pragma: no cover
            print(f"[vbx-worker] error: {exc}")
        finally:
            db.close()
        time.sleep(3)


if __name__ == "__main__":
    main()
