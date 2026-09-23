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

- Wave 2 Gate (unit + integration + screens + e2e regression): **PASS**
- **P0 TC-002**: PASS (integration mock session; real viewer user not created — `disableSignUp: true`)
- Policy note: `canTriggerSync` = **admin only** (analyst also 403) — aligned with auth-roles matrix; TC-002 draft updated
- Helper: `tests/helpers/session.ts`; vitest `fileParallelism: false` for shared DB/Redis
- Screenshots: B3/C1/C2/D1/D2/D3 captured (`npm run test:screenshots`)
- Failures: **none**
- См. [WAVE-02-CHECKLIST](../journal/WAVE-02-CHECKLIST.md)

## Wave 3 — scans, findings, dashboard, walkthrough smoke (TC-011…017)

Дата: 2026-09-23 00:08 UTC  
Окружение: cloud-agent (Node v22.14.0, npm 10.9.7, Vitest 3.2.7, Playwright 1.63.0 / chromium)  
App: `http://localhost:3000` (`next start`); Postgres seeded; Redis + BullMQ worker running  
Admin: `admin@local.dev` / `.env` bootstrap

| Suite / TC | Command | Exit | Result | Evidence / notes |
|------------|---------|------|--------|------------------|
| unit (full) | `npm run test:unit` | 0 | PASS | 10 files, **30** tests |
| integration (full) | `npm run test:integration` | 0 | PASS | 6 files, **32** tests |
| e2e (full) | `npm run test:e2e` | 0 | PASS | 10 tests (1 setup + 3 TC-001 + 3 TC-003 + 1 TC-004 + 1 TC-016 + 1 TC-017) |
| test:all | `npm run test:all` | 0 | PASS | unit && integration && e2e |
| TC-011 | `tests/unit/scan-allowlist.test.ts` (+ allowlist) | 0 | PASS | outside → 400; inside → 202 |
| TC-012 | `nmap-parse` + `nmap-persist` | 0 | PASS | services 22/80/443 + CVE finding |
| TC-013 | `nuclei-parse` + `nuclei-persist` | 0 | PASS | 5 findings; broken JSONL skipped |
| TC-014 | `tests/integration/findings-status.test.ts` | 0 | PASS | 6 tests — transitions + RBAC |
| TC-015 | `tests/integration/sync-enqueue.test.ts` | 0 | PASS | Wave 2 refresh; 9 tests w/ TC-002 |
| TC-016 | `dashboard-counters` integration + e2e | 0 | PASS | API↔SQL; UI cards match API |
| TC-017 | `tests/e2e/walkthrough-smoke.spec.ts` | 0 | PASS | dashboard→vulns→scans→findings→assets |

### Сводка

- Wave 3 Gate (TC-011…017 + screens + test:all): **PASS**
- P0 TC-011/012/013/014: PASS; TC-015 refreshed PASS
- P1 TC-016/017: PASS
- Screenshots E1–E4, F1–F2 captured; A1 blocked (no docker)
- Open P0: **none**
- См. [WAVE-03-CHECKLIST](../journal/WAVE-03-CHECKLIST.md)
- Failures: **none**

## Final regression — 2026-09-23 00:12 UTC

| Suite | Command | Exit | Result |
|-------|---------|------|--------|
| typecheck | `npm run typecheck` | 0 | PASS |
| lint | `npm run lint` | 0 | PASS |
| test:all | `npm run test:all` | 0 | PASS (30 unit + 32 integration + 10 e2e) |
| screenshots | `npm run test:screenshots` | 0 | PASS |

Gates 0–3: **PASS**. DoD MVP (minus A1 docker screenshot in this environment): met.
