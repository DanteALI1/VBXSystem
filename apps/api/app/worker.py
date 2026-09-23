"""Background worker: process pending sync_runs."""

from __future__ import annotations

import subprocess
import time

from app.db import SessionLocal
from app.services.sync_jobs import process_pending_once


def _ensure_migrations() -> None:
    for i in range(30):
        try:
            subprocess.check_call(["alembic", "upgrade", "head"])
            return
        except Exception as exc:
            print(f"[vbx-worker] waiting for migrations ({i}): {exc}")
            time.sleep(2)


def main() -> None:
    print("[vbx-worker] started")
    _ensure_migrations()
    while True:
        db = SessionLocal()
        try:
            n = process_pending_once(db)
            if n:
                print(f"[vbx-worker] processed {n} job(s)")
        except Exception as exc:  # pragma: no cover
            print(f"[vbx-worker] error: {exc}")
        finally:
            db.close()
        time.sleep(3)


if __name__ == "__main__":
    main()
