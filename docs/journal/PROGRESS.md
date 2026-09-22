# PROGRESS

## 2026-09-22 22:55 — Волна 0 / Foundation

### Цель

Заложить foundation MVP: Next.js scaffold, Drizzle schema, docker-compose, domain helpers, unit tests, полная документация и черновики TC-001…017.

### Что сделано

- Scaffold приложения (маршруты UI placeholders, Better Auth каркас).
- `db/schema.ts` + drizzle migration.
- docker-compose: postgres, redis, app, worker.
- Domain: `lib/domain/allowlist.ts`, `lib/domain/severity.ts`.
- Unit: `tests/unit/allowlist.test.ts`, `tests/unit/severity.test.ts` (14 tests).
- Worker stub: очереди `nvd-sync`, `bdu-sync`, `scan`.
- Документация: полное дерево `docs/` (архитектура, setup, features, api, ops, ADR, journal, testing + cases).
- TC-001…017 draft files.
- Stub: `tests/fixtures/README.md`, `scripts/capture-setup-screenshots.ts`.

### Как проверял (команды + UI)

```bash
npm run typecheck   # exit 0
npm run lint        # exit 0 (eslint .)
npm run test:unit   # exit 0 — 14 passed
```

UI: placeholders `/login`, `/app/*` — визуально не гонялись (Wave 0 допускает placeholders).  
Docker binary отсутствует в среде → A1 screenshot blocked.

### Результат PASS

Gate Wave 0 закрыт. P0 foundation (schema/domain/unit) зелёные. Открытых P0 нет.

### Скриншоты

- A1 docker-up: **blocked** (нет `docker` в среде агента). Зафиксировано в walkthrough.
- A2–F2: pending (волны 1–3).

### Тесты

- Unit allowlist/severity — PASS.
- Integration/e2e — N/A skeleton.
- См. [RESULTS.md](../testing/RESULTS.md).

### Риски/TODO

- Bootstrap admin не реализован (только env) → Wave 1.
- Auth UI / middleware не wired → Wave 1.
- Worker processors отсутствуют → Wave 2–3.
- API endpoints — план в docs/api.
- Нет скринов walkthrough → Waves 1–3.
- Docker недоступен в CI-агенте — compose файлы есть, прогон локально/в среде с Docker.

### Commit

`chore: scaffold vuln-mgmt + docs/testing skeleton`
