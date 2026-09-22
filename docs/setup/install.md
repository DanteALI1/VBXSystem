# Установка

## Требования

- Node.js 20+
- npm
- Docker + Docker Compose (рекомендуется для Postgres/Redis и полного стека)
- Порты: `3000` (app), `5432` (postgres), `6379` (redis)

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

TODO: отдельного entrypoint migrate-on-start нет — миграцию запускать вручную после healthy postgres.

5. Bootstrap admin — см. [bootstrap-admin.md](bootstrap-admin.md).

6. (Опционально) демо-данные:

```bash
npm run seed:vulns    # каталог уязвимостей (Wave 1)
npm run seed:assets   # lab hosts для /app/assets
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

5. Worker (отдельный терминал — обязателен для sync):

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

7. Открыть `APP_URL`, войти bootstrap-admin.

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
| `npm run seed:assets` | Демо-активы |
| `npm run worker` | BullMQ processors |
| `npm run smoke:sync` | Fixture NVD+BDU enqueue + wait |

## Проверка после установки

- UI: login → `/app` dashboard, `/app/vulnerabilities`, `/app/assets`, `/app/settings/sync`, `/app/settings/allowlist`.
- Postgres healthy, Redis `PING` → `PONG`.
- `npm run worker` логирует processors; после `smoke:sync` в БД есть fixture CVE/BDU и `sync_states.status=succeeded`.
- Env: [configuration.md](configuration.md).

Скриншоты установки: [setup-walkthrough](../setup-walkthrough/README.md).
