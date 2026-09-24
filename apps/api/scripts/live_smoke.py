"""Live smoke against running stack (uses VBX_ADMIN_* from env)."""
from __future__ import annotations

import os
import sys

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import create_app
from app.models import BduRecord, CveBduLink, CveRecord, LocalVuln, SyncRun
from app.services.sync_jobs import _nvd_should_resume


def main() -> int:
    pwd = os.environ.get("VBX_ADMIN_PASSWORD") or "ChangeMe_StrongPass_123!"
    user = os.environ.get("VBX_ADMIN_USERNAME") or "admin"
    app = create_app()
    c = TestClient(app)
    errors: list[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            errors.append(msg)
            print("FAIL:", msg)
        else:
            print("OK:", msg)

    h_resp = c.get("/health")
    check(h_resp.status_code == 200, f"health {h_resp.status_code}")

    r = c.post("/auth/login", json={"username": user, "password": pwd})
    check(r.status_code == 200, f"login {r.status_code} {r.text[:120]}")
    if r.status_code != 200:
        print("SMOKE_FAIL")
        return 1
    tok = r.json()
    check(bool(tok.get("access_token") and tok.get("refresh_token")), "tokens present")

    rr = c.post("/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    check(rr.status_code == 200, f"refresh {rr.status_code}")

    h = {"Authorization": f"Bearer {tok['access_token']}"}

    s = c.get("/search", params={"page": 1, "page_size": 10}, headers=h)
    body = s.json() if s.status_code == 200 else {}
    check(s.status_code == 200 and body.get("total", 0) > 100_000, f"search total={body.get('total')}")
    check(len(body.get("results", [])) == 10, f"search page size {len(body.get('results', []))}")

    s3 = c.get("/search", params={"kev": "true", "page_size": 5}, headers=h)
    kev_body = s3.json() if s3.status_code == 200 else {}
    results = kev_body.get("results") or []
    check(s3.status_code == 200 and results and all(x.get("is_cisa_kev") for x in results), "kev filter")

    db = SessionLocal()
    try:
        link = db.query(CveBduLink).first()
        cve_id = link.cve_id if link else db.query(CveRecord).order_by(CveRecord.id).first().id
        d = c.get(f"/vuln/{cve_id}", headers=h)
        check(d.status_code == 200, f"cve detail {cve_id} {d.status_code}")

        bdu = db.get(BduRecord, "BDU:2022-03712")
        if bdu:
            bd = c.get("/bdu/BDU:2022-03712", headers=h)
            j = bd.json() if bd.status_code == 200 else {}
            check(
                bd.status_code == 200 and bool(j.get("cvss3_vector")),
                f"bdu enrich cvss3={bool(j.get('cvss3_vector'))} ver={bool(j.get('software_versions'))}",
            )
        else:
            print("SKIP: sample BDU missing")

        loc = db.query(LocalVuln).first()
        if loc:
            ld = c.get(f"/local/{loc.id}", headers=h)
            check(ld.status_code == 200, f"local {loc.id}")

        check(_nvd_should_resume(db) is False, "nvd resume false after complete mirror")

        ep = c.post("/epss/sync", headers=h)
        check(ep.status_code == 200, f"epss enqueue {ep.status_code}")
        if ep.status_code == 200:
            run_id = ep.json()["run"]["id"]
            run = db.get(SyncRun, run_id)
            check(run is not None and run.status in {"pending", "running", "success"}, f"epss run={run.status if run else None}")

        xs = c.get("/xdb/connector/stub", headers=h)
        check(xs.status_code == 501, f"xdb stub {xs.status_code}")

        ds = c.get("/settings/database", headers=h)
        check(ds.status_code == 200, f"database settings {ds.status_code}")

        # Security nav parity: non-super admin would be UI-only; API still require_super for security
        sec = c.get("/settings/security", headers=h)
        check(sec.status_code == 200, f"security settings {sec.status_code}")
    finally:
        db.close()

    if errors:
        print("SMOKE_FAIL", len(errors))
        return 1
    print("SMOKE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
