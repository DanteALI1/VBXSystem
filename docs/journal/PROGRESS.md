# PROGRESS — журнал волн VBXSystem

---

## 2026-09-23 05:49 UTC — Волна 0 / Foundation

### Цель
Scaffold Next.js/pnpm/shadcn/compose, Drizzle schema+migration, docs tree, ADR-004 (BSL), TC-001…020 draft, unit smoke (severity/allowlist/search).

### Что сделано
- Next.js 15 App Router + TS + Tailwind + shadcn (dense UI kit)
- `.nvmrc`=20, `pnpm-lock.yaml`, `.env.example`
- `docker-compose.yml` (postgres/redis healthchecks; app/worker depends_on healthy)
- Drizzle schema: User/Auth, Vulnerability(+sources/tags/views/history), Asset/Service, Allowlist, ScanJob, Finding, SyncState
- Domain: `severityFromCvss`, allowlist matcher, advanced query parser
- Worker stubs (BullMQ queues nvd/bdu/scan)
- Docs: architecture/setup/features/api/ops/ADR/testing/journal
- ADR-004: OpenCVE BSL 1.1 — UX patterns only, no code/brand
- TC-001…020 drafts; fixtures NVD/BDU/nmap/nuclei
- Unit tests: 11 PASS; typecheck PASS; lint PASS
- Migration applied on `vuln` + `vuln_test`
- Screenshot A1 `01-docker-up.png` (postgres+redis healthy)

### Как проверял (команды + UI)
```
pnpm typecheck
pnpm lint
pnpm test:unit
docker compose up -d postgres redis && docker compose ps
DATABASE_URL=... pnpm db:migrate
DATABASE_URL_TEST=... pnpm db:migrate:test
```

### Результат PASS/FAIL
**PASS** (Gate 0). A1 снята для postgres+redis healthy; полный `compose up --build` app/worker — Wave 1+ (auth/UI ready).

### Скриншоты
- A1: `docs/setup-walkthrough/images/01-docker-up.png`

### Тесты
- Unit: 3 files / 11 tests PASS
- TC-020 (parser): automated in `tests/unit/advanced-query.test.ts`
- Integration/e2e: deferred Wave 1+

### Риски/TODO
- Better Auth + middleware — Wave 1
- Full app/worker images not yet verified healthy end-to-end
- shadcn `form` component missing (optional until forms land)
- `cn` npm package rejected — local `cn()` via clsx/twMerge

### Commit
`chore: scaffold vuln-mgmt + docs/testing skeleton`

---


---

## 2026-09-23 06:15 UTC — Волна 1 / Auth + Shell + Vulns

### Цель
Better Auth, app shell/dashboard, OpenCVE-like vulnerabilities list/detail (search/filters/tags/views), seed, e2e, screenshots.

### Что сделано
- Better Auth email/password + RBAC + middleware + bootstrap seed
- App shell left nav + Sign out + session email/role
- Dashboard summary API + real KPI/recent table
- Vulns API (list/detail/tags/saved-views) + TanStack table + facets + advanced query + query builder
- Seed: CVE-2024-0001 ↔ BDU:2024-00001 + 10 samples
- Parallel subagents merged: auth / shell / vulns

### Как проверял
```
pnpm typecheck && pnpm lint && pnpm test:unit
pnpm db:seed
pnpm test:e2e -- tests/e2e/login.spec.ts tests/e2e/vulnerabilities.spec.ts
SCREENSHOT_WAVE=1 pnpm test:screenshots
```

### Результат PASS/FAIL
**PASS**

### Скриншоты
A2/B1/B2/C3/C4/C5/F2 → `02-login.png` … `19-app-shell.png`

### Тесты
- Unit 16 PASS; E2E 7 PASS (TC-001 + vulns smoke)

### Риски/TODO
- Wave 2: NVD/BDU sync workers, assets/allowlist CRUD
- API routes still loosely gated (pages protected); tighten with requireSession in Wave 2

### Commit
`feat: auth shell opencve-like vulns + docs/tests/screens wave1`

## Wave 1 — done (see above)

---

## 2026-09-23 — Волна 2 / BDU XML sync (subagent)

### Цель
BDU ФСТЭК XML download/upload → parse → upsert; BDU↔CVE link; SyncState by file hash; admin upload fallback; history.

### Что сделано
- `src/lib/sync/bdu/**` — download/parse/upsert/SyncState/queue/run
- Worker `bdu-processor` wired in `src/workers`
- API `POST /api/settings/sync/bdu` + `/upload` (202 enqueue)
- Settings Sync page: modular `BduSyncControls`
- Fixture `bdu-mini.xml` (CVE link + bdu-only + broken node)
- TC-007 / TC-008 integration (fixtures/mocks; no real BDU_XML_URL)

### Как проверял
```
pnpm typecheck
DATABASE_URL_TEST=… pnpm exec vitest run tests/integration/bdu-parse.test.ts tests/integration/bdu-upload.test.ts
```

### Commit
`feat(wave2): bdu xml sync upload cve link`

## Wave 2 — in progress (BDU done; NVD/assets parallel)

## Wave 3 — pending
