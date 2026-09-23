# VBXSystem — Build Status

| Wave | Agent | Status | Notes |
|------|-------|--------|-------|
| W0 | Foundation | DONE | Monorepo, Compose, RBAC seed |
| W1 | Auth & Users | DONE | Register/approval, 2FA, users |
| W2 | Vuln Core (NVD/BDU/KEV) | DONE | Sync jobs + Settings/Database UI |
| W3 | Search & Detail | **DONE** | Search + CVE/BDU cards, KEV highlight |
| W4 | Dashboard / EPSS / CVEQL | pending | Depends on W2–W3 |
| W5 | XDB Exploits | pending | Depends on W2–W3 |
| W6 | Settings suite | pending | Depends on W1 (+ W2 for Database UI) |
| W7 | Tickets | pending | Depends on W1, W3 |
| W8 | Hardening & E2E | pending | Прогон install.sh на чистой РЕД ОС |

Last updated: 2026-09-23

## W3 acceptance
- `GET /search` — mixed CVE + standalone BDU, filters (severity, KEV, has BDU, date), sort, pagination
- `GET /vuln/{cve_id}` — CVSS, CWE, KEV, EPSS, БДУ panel
- `GET /bdu/{bdu_id}` — standalone/linked card
- Web `/search`, `/vuln/[cveId]`, `/bdu/[bduId]` with KEV row accent + accessible badges
- Pytest `tests/test_search.py`; Playwright smoke `e2e/search.spec.ts`

## W2 acceptance
- Models: cves, bdu_records, cve_bdu_links, cisa_kev, epss_scores, sync_runs, source_files
- NVD sync (mock without key / API with key), KEV sync
- BDU XML upload with merge rules (linked → CVE section, else standalone)
- `/settings/database` UI (NVD + BDU blocks)
- Worker `python -m app.worker`
- Pytest merge rules green
