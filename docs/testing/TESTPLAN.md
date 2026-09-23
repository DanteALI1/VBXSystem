# TESTPLAN — волны → покрытие TC

| Волна | Фокус | TC (обязательные) | Примечание |
|-------|-------|-------------------|------------|
| **0 Foundation** | schema, domain, docs, unit smoke | каркас TC-001…017; unit allowlist/severity | Gate: typecheck/lint/unit; e2e N/A |
| **1 Auth + RBAC** | login, roles, bootstrap + vuln list/detail P0 | TC-001 (PASS), TC-002 (Wave 2), TC-003/004 (PASS early) | e2e P0 |
| **2 Vuln sync** | NVD/BDU upsert, rate limit, upload | TC-005, TC-006, TC-007, TC-008, TC-015 | unit/integration |
| **3 Assets + allowlist** | CRUD | TC-009, TC-010 | e2e/integration |
| **4 Scans** | gate + parsers | TC-011, TC-012, TC-013 | unit/integration |
| **5 Findings + dashboard** | status, counters | TC-014, TC-016 | e2e/integration |
| **6 UI polish + evidence** | filters/detail/walkthrough | TC-003/004 (done Wave 1), TC-017 | e2e + screenshots |

> **Cloud Wave 3 (final QA):** TC-011…017 закрыты автоматизацией в одной поставке (scans + findings + dashboard + smoke). Исторические волны 3–6 TESTPLAN выше — трассировка фич; RESULTS Wave 3 = gate TC-011…017.

## Приоритеты

- **P0** — блокеры релиза MVP для соответствующей волны.
- **P1** — важно, можно закрыть соседней волной (TC-008, TC-016, TC-017).

## Трассировка Automation

| TC | Файл(ы) |
|----|---------|
| TC-001 | `tests/e2e/login.spec.ts` |
| TC-002 | `tests/integration/sync-enqueue.test.ts` (viewer 403) |
| TC-003 | `tests/e2e/vulnerabilities-filters.spec.ts` |
| TC-004 | `tests/e2e/vulnerability-detail.spec.ts` |
| TC-005 | `tests/unit/nvd-upsert.test.ts` |
| TC-006 | `tests/unit/nvd-backoff.test.ts` |
| TC-007 | `tests/unit/bdu-parse.test.ts` |
| TC-008 | `tests/integration/bdu-upload.test.ts` |
| TC-009 | `tests/integration/assets-crud.test.ts` |
| TC-010 | `tests/integration/allowlist-crud.test.ts` |
| TC-011 | `tests/unit/allowlist.test.ts` + `tests/unit/scan-allowlist.test.ts` |
| TC-012 | `tests/unit/nmap-parse.test.ts` + `tests/unit/nmap-persist.test.ts` |
| TC-013 | `tests/unit/nuclei-parse.test.ts` + `tests/unit/nuclei-persist.test.ts` |
| TC-014 | `tests/integration/findings-status.test.ts` |
| TC-015 | `tests/integration/sync-enqueue.test.ts` |
| TC-016 | `tests/integration/dashboard-counters.test.ts` + `tests/e2e/dashboard-counters.spec.ts` |
| TC-017 | `tests/e2e/walkthrough-smoke.spec.ts` (+ `npm run test:screenshots`) |
| Auth setup | `tests/e2e/auth.setup.ts` + `tests/helpers/auth.ts` |
| Severity helper | `tests/unit/severity.test.ts` |
