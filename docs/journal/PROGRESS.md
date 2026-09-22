# PROGRESS

## 2026-09-22 23:21 — Волна 1 / Auth + shell + vulns

### Цель

Auth (Better Auth + bootstrap), app shell + dashboard, каталог уязвимостей (list/detail/API/seed), e2e TC-001/003/004, скрины A2/B1/B2/C3/C4/F2.

### Что сделано

- Better Auth email/password, `proxy.ts` gate `/app/**`, login UI, role helpers, `npm run bootstrap:admin`
- App shell (nav, user menu), dashboard API + counters + last sync
- Vulnerabilities API/list/detail + TanStack Table filters; `npm run seed:vulns` (6 records)
- Playwright e2e TC-001/003/004; screenshot script + PNGs
- Docs: auth-roles, bootstrap, vulnerabilities, dashboard, RESULTS, walkthrough

### Как проверял (команды + UI)

```bash
npm run typecheck          # exit 0
npm run lint               # exit 0
npm run test:unit          # exit 0 — 14 passed
npm run test:e2e           # exit 0 — 8 passed
npm run test:screenshots   # exit 0
```

UI: login, dashboard (6 vulns), vulnerabilities table, CVE+BDU detail — verified via screenshots + e2e.

### Результат PASS

Gate Wave 1 закрыт. Открытых P0 по scope волны нет. TC-002 отложен на Wave 2.

### Скриншоты

- A2, B1, B2, C3, C4, F2 — `captured` в `docs/setup-walkthrough/images/`
- A1 — всё ещё blocked (нет docker)

### Тесты

- TC-001/003/004 — automated, passed
- См. [RESULTS.md](../testing/RESULTS.md)

### Риски/TODO

- Better Auth rate-limit 3/10s на sign-in — mitigated storageState
- Sync workers / assets / allowlist → Wave 2
- Scans / findings → Wave 3
- AUTH_SECRET короткий в `.env.example` — только для local scaffold

### Commit

`feat: auth shell vulns + docs/tests/screens wave1`

## 2026-09-22 22:55 — Волна 0 / Foundation

### Цель

Foundation MVP: scaffold, schema, docs/TC skeleton.

### Результат PASS

См. предыдущую запись / WAVE-00-CHECKLIST.

### Commit

`chore: scaffold vuln-mgmt + docs/testing skeleton`
