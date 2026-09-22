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

TODO: в Wave 0 отдельного entrypoint migrate-on-start нет — миграцию запускать вручную после healthy postgres.

5. Bootstrap admin — см. [bootstrap-admin.md](bootstrap-admin.md).

6. Открыть `APP_URL` (по умолчанию `http://localhost:3000`).

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
npm run dev
```

5. Worker (отдельный терминал):

```bash
npm run worker
```

6. Bootstrap admin → открыть `APP_URL`.

## Полезные скрипты

| Команда | Назначение |
|---------|------------|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest unit |
| `npm run db:generate` | Drizzle generate |
| `npm run db:migrate` | Drizzle migrate |
| `npm run db:push` | Drizzle push (dev) |

## Проверка после установки

- UI загружается (Wave 0: placeholders на `/login`, `/app/*`).
- Postgres healthy, Redis pong.
- `npm run worker` логирует очереди `nvd-sync`, `bdu-sync`, `scan`.

Скриншоты установки: [setup-walkthrough](../setup-walkthrough/README.md).
