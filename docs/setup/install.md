# Установка

## Требования

- Node.js 20+
- npm
- Docker + Docker Compose (рекомендуется для Postgres/Redis и полного стека)
- Порты: `3000` (app), `5432` (postgres), `6379` (redis)
- Опционально для live-сканов: `nmap`, `nuclei` на PATH (или `NMAP_BIN` / `NUCLEI_BIN`); без них nmap/nuclei работают в fixture mode

## Вариант A — полный стек Docker

1. Клонировать репозиторий и перейти в корень.
2. Скопировать env:

```bash
cp .env.example .env
```

В `.env` для compose оставить hostnames `postgres` / `redis` как в примере **или** полагаться на override в `docker-compose.yml` (`DATABASE_URL` / `REDIS_URL` задаются сервисам app/worker явно).

3. Собрать и поднять:

```bash
docker compose up --build
```

Сервисы: `postgres`, `redis`, `app`, `worker`.

4. Миграции:

```bash
# из контейнера app или с хоста при доступе к БД
npm run db:migrate
```

Отдельного entrypoint migrate-on-start нет — миграцию запускать вручную после healthy postgres.

5. Bootstrap admin — см. [bootstrap-admin.md](bootstrap-admin.md).

6. Демо-данные и allowlist:

```bash
npm run seed:vulns    # каталог уязвимостей
npm run seed:assets   # lab hosts 10.0.1.10 / 10.0.1.20 / 10.0.2.5
# Allowlist НЕ сидится скриптом — создать CIDR 10.0.0.0/8 в UI
# /app/settings/allowlist (admin) перед сканами
```

7. Открыть `APP_URL` (по умолчанию `http://localhost:3000`).

## Вариант B — локальный Next.js + Docker только для инфраструктуры

1. `cp .env.example .env`
2. Для локального npm выставить:

```env
DATABASE_URL=postgresql://vuln:vuln@localhost:5432/vuln
REDIS_URL=redis://localhost:6379
APP_URL=http://localhost:3000
```

(В репозитории `.env` уже может быть с localhost — не коммитить секреты.)

3. Инфра:

```bash
docker compose up -d postgres redis
```

4. Приложение:

```bash
npm install
npm run db:migrate
npm run bootstrap:admin
npm run seed:vulns
npm run seed:assets
npm run dev
```

5. Worker (отдельный терминал — обязателен для sync и queue-сканов):

```bash
npm run worker
```

Ожидаемый лог: `worker ready — processors registered` с очередями `nvd-sync`, `bdu-sync`, `scan`.

6. Smoke sync (fixture, без внешнего NVD/BDU):

```bash
# worker уже запущен
npm run smoke:sync
```

Скрипт `scripts/smoke-sync-fixture.ts` ставит оба job в режиме fixture, ждёт `sync_states` → `succeeded|failed`, печатает sample CVE/BDU и meta. Для live sync см. [runbook](../ops/runbook.md) и UI `/app/settings/sync`.

7. Allowlist + smoke scan (fixture):

```bash
# Admin UI: создать enabled CIDR 10.0.0.0/8 (если ещё нет)
# Затем inline smoke — worker не обязателен:
npm run smoke:scan
```

Ожидание: nmap fixture → `succeeded`, ~4 findings, ~3 services; отчёт в `storage/reports/<id>/`.

Через очередь: UI `/app/scans` или `POST /api/scans` с `{ "fixture": true }` при запущенном worker.

8. Открыть `APP_URL`, войти bootstrap-admin. Проверить `/app/findings`, `/app/scans`.

## Полезные скрипты

| Команда | Назначение |
|---------|------------|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest unit |
| `npm run test:integration` | Vitest integration (нужна БД) |
| `npm run test:e2e` | Playwright |
| `npm run db:generate` | Drizzle generate |
| `npm run db:migrate` | Drizzle migrate |
| `npm run db:push` | Drizzle push (dev) |
| `npm run bootstrap:admin` | Создать/обновить admin |
| `npm run seed:vulns` | Демо-уязвимости |
| `npm run seed:assets` | Демо-активы (не allowlist) |
| `npm run worker` | BullMQ processors (nvd/bdu/scan) |
| `npm run smoke:sync` | Fixture NVD+BDU enqueue + wait |
| `npm run smoke:scan` | Inline nmap fixture `runScanJob` |

## Проверка после установки

- UI: login → `/app` dashboard, `/app/vulnerabilities`, `/app/assets`, `/app/findings`, `/app/scans`, `/app/settings/sync`, `/app/settings/allowlist`.
- Postgres healthy, Redis `PING` → `PONG`.
- `npm run worker` логирует processors; после `smoke:sync` — fixture CVE/BDU и `sync_states.status=succeeded`.
- После allowlist + `smoke:scan` — findings/services и файлы в `storage/reports/`.
- Env: [configuration.md](configuration.md).

Скриншоты установки: [setup-walkthrough](../setup-walkthrough/README.md).
