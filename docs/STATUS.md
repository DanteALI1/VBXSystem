# VBXSystem — Build Status

| Wave | Agent | Status | Notes |
|------|-------|--------|-------|
| W0 | Foundation | **DONE** | Monorepo, Compose, RBAC seed, login + app shell |
| W1 | Auth & Users | **NEXT** | Depends on W0 |
| W2 | Vuln Core (NVD/BDU/KEV) | pending | Depends on W0 |
| W3 | Search & Detail | pending | Depends on W2 |
| W4 | Dashboard / EPSS / CVEQL | pending | Depends on W2–W3 |
| W5 | XDB Exploits | pending | Depends on W2–W3 |
| W6 | Settings suite | pending | Depends on W1 (+ W2 for Database UI) |
| W7 | Tickets | pending | Depends on W1, W3 |
| W8 | Hardening & E2E | pending | Прогон install.sh на чистой РЕД ОС |

Last updated: 2026-09-23

## W0 acceptance
- `docker compose up -d --build` поднимает postgres/redis/api/web/worker
- `/health`, `/ready` OK; login выдаёт JWT
- `/login` UI и app shell с placeholder-разделами
- Seed `super_admin` из `VBX_ADMIN_*`
- Alembic `0001_initial` + pytest health smoke
- Совместимость с `deploy/redos/install.sh` (`VBX_*` env, compose в корне)
