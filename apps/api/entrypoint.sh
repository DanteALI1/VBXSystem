#!/bin/sh
set -eu

echo "[vbx-api] waiting for database…"
python - <<'PY'
import os, time, sys
from sqlalchemy import create_engine, text
url = os.environ.get("VBX_DATABASE_URL", "postgresql+psycopg://vbx:vbx@postgres:5432/vbx")
for i in range(60):
    try:
        eng = create_engine(url)
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
        print("[vbx-api] database is ready")
        sys.exit(0)
    except Exception as e:
        print(f"[vbx-api] db not ready ({i}): {e}")
        time.sleep(2)
print("[vbx-api] database wait timeout", file=sys.stderr)
sys.exit(1)
PY

echo "[vbx-api] running migrations…"
alembic upgrade head

echo "[vbx-api] starting uvicorn…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
