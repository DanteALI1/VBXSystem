# RESULTS

## Wave 0 — unit smoke

Дата: 2026-09-22 22:55 UTC  
Окружение: cloud-agent (Node v22.14.0, npm 10.9.7)

| Suite | Command | Exit | Result | Evidence / notes |
|-------|---------|------|--------|------------------|
| typecheck | `npm run typecheck` | 0 | PASS | `tsc --noEmit` |
| lint | `npm run lint` | 0 | PASS | `eslint .` |
| unit | `npm run test:unit` | 0 | PASS | 2 files, 14 tests (allowlist 10 + severity 4) |
| integration | `npm run test:integration` | — | N/A | пустой каталог / .gitkeep |
| e2e | `npm run test:e2e` | — | N/A | скелет; Playwright config в Wave 1 |
| screenshots | `npm run test:screenshots` | 0 | STUB | `not implemented` log |

### Сводка

- Wave 0 Gate: **PASS**
- TC drafts: TC-001…017 созданы (`Status: draft`)
- Автоматизация Wave 0: domain unit tests (связанные с TC-011 allowlist matcher)
- См. [WAVE-00-CHECKLIST](../journal/WAVE-00-CHECKLIST.md)

## Wave 1 — auth + vuln list/detail e2e (P0)

Дата: 2026-09-22 23:16 UTC  
Окружение: cloud-agent (Node v22.14.0, npm 10.9.7, Playwright 1.63.0 / chromium)  
App: `http://localhost:3000` (`next start`); Postgres seeded (`npm run seed:vulns`); admin bootstrap from `.env`

| Suite / TC | Command | Exit | Result | Evidence / notes |
|------------|---------|------|--------|------------------|
| e2e (full) | `npm run test:e2e` | 0 | PASS | 8 tests (1 setup + 3 TC-001 + 3 TC-003 + 1 TC-004) |
| TC-001 | `tests/e2e/login.spec.ts` | 0 | PASS | fail / success / unauth redirect |
| TC-003 | `tests/e2e/vulnerabilities-filters.spec.ts` | 0 | PASS | CVE search, severity=critical, source nvd/bdu |
| TC-004 | `tests/e2e/vulnerability-detail.spec.ts` | 0 | PASS | seed id `949dc591-…` CVE+BDU+sources |
| TC-002 | — | — | SKIP | Wave 2 (viewer sync) — out of scope |

### Сводка

- Wave 1 P0 automation (TC-001/003/004): **PASS**
- Auth setup: `tests/e2e/auth.setup.ts` → `playwright/.auth/admin.json` (gitignored)
- Note: Better Auth `/sign-in` rate-limit (3/10s under `next start`) — mitigated via shared storageState + helper retry
- Screenshots: `npm run test:screenshots` exit 0 — A2/B1/B2/C3/C4/F2
- Gate Wave 1: **PASS** — см. [WAVE-01-CHECKLIST](../journal/WAVE-01-CHECKLIST.md)

## Wave 2 — sync, upsert, assets/allowlist (P0 + TC-008 P1)

Дата: 2026-09-22 23:33 UTC  
Окружение: cloud-agent (Node v22.14.0, npm 10.9.7, Vitest 3.2.7)  
Postgres + Redis local; BullMQ worker may be running (`npm run worker`)  
Admin env: `admin@local.dev` / `ChangeMe123!` (e2e not required this wave)

| Suite / TC | Command | Exit | Result | Evidence / notes |
|------------|---------|------|--------|------------------|
| unit (full) | `npm run test:unit` | 0 | PASS | 5 files, **20** tests |
| integration (full) | `npm run test:integration` | 0 | PASS | 4 files, **23** tests |
| TC-005 | `tests/unit/nvd-upsert.test.ts` | 0 | PASS | idempotent CVE upsert + nvd source |
| TC-006 | `tests/unit/nvd-backoff.test.ts` | 0 | PASS | 429 Retry-After, maxRetries, no-key pause |
| TC-007 | `tests/unit/bdu-parse.test.ts` | 0 | PASS | XML parse + CVE link upsert |
| TC-008 | `tests/integration/bdu-upload.test.ts` | 0 | PASS | upload enqueue + `runBduSync` hash/skip (P1) |
| TC-009 | `tests/integration/assets-crud.test.ts` | 0 | PASS | lib+API CRUD, viewer 403, cascade |
| TC-010 | `tests/integration/allowlist-crud.test.ts` | 0 | PASS | CRUD, admin-only mutate, invalid CIDR 400 |
| TC-015 | `tests/integration/sync-enqueue.test.ts` | 0 | PASS | status GET, nvd/bdu 202+job, running→409 |
| TC-002 (P0) | `tests/integration/sync-enqueue.test.ts` | 0 | PASS | viewer/analyst 403; admin 202 (mock session) |
| e2e (Wave 2) | — | — | N/A | RBAC via session mock; no new Playwright specs |

### Сводка

- Wave 2 Gate (unit + integration): **PASS**
- **P0 TC-002**: PASS (integration mock session; real viewer user not created — `disableSignUp: true`)
- Policy note: `canTriggerSync` = **admin only** (analyst also 403) — aligned with auth-roles matrix; TC-002 draft updated
- Helper: `tests/helpers/session.ts`; vitest `fileParallelism: false` for shared DB/Redis
- Failures: **none**
