"""Background worker: process pending sync_runs."""

from __future__ import annotations

import time

from app.db import SessionLocal
from app.services.sync_jobs import process_pending_once


def main() -> None:
    print("[vbx-worker] started")
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
