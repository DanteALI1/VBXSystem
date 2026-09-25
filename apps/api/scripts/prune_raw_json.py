#!/usr/bin/env python3
"""One-shot prune of oversized cves.raw_json.

Usage (from apps/api or with PYTHONPATH):
  python -m scripts.prune_raw_json --min-bytes 10000 --limit 50000
"""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prune huge CVE raw_json blobs")
    parser.add_argument("--min-bytes", type=int, default=10_000)
    parser.add_argument("--limit", type=int, default=50_000)
    parser.add_argument("--yes", action="store_true", help="Required confirm flag")
    args = parser.parse_args(argv)
    if not args.yes:
        print("Refuse: pass --yes to confirm irreversible prune", file=sys.stderr)
        return 2

    from app.db import SessionLocal
    from app.services.nvd_sync import prune_huge_raw_json

    db = SessionLocal()
    try:
        result = prune_huge_raw_json(db, min_bytes=args.min_bytes, limit=args.limit)
        print(result)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
