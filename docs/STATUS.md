# VBXSystem — Build Status

| Wave | Agent | Status | Notes |
|------|-------|--------|-------|
| W0 | Foundation | **NEXT** | Monorepo + Docker; совместимость с `deploy/redos/install.sh` |
| W1 | Auth & Users | pending | Depends on W0 |
| W2 | Vuln Core (NVD/BDU/KEV) | pending | Depends on W0 |
| W3 | Search & Detail | pending | Depends on W2 |
| W4 | Dashboard / EPSS / CVEQL | pending | Depends on W2–W3 |
| W5 | XDB Exploits | pending | Depends on W2–W3 |
| W6 | Settings suite | pending | Depends on W1 (+ W2 for Database UI) |
| W7 | Tickets | pending | Depends on W1, W3 |
| W8 | Hardening & E2E | pending | Прогон install.sh на чистой РЕД ОС |

Last updated: 2026-09-23  
Done: docs + agent prompts + **РЕД ОС installer** (`deploy/redos/`). App code starts at W0.
