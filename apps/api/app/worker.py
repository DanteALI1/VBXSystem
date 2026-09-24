"""Background worker: process pending sync_runs.

Migrations are owned by the API entrypoint — worker only waits for alembic_version.
"""

from __future__ import annotations

import time

from sqlalchemy import text

from app.db import SessionLocal
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
    print("[vbx-worker] started")
    _wait_for_migrations()
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
