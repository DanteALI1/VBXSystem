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

## Wave 1 — pending

## Wave 2 — pending

## Wave 3 — pending
