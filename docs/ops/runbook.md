# Runbook

## Старт / стоп

### Docker Compose (полный стек)

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f app worker
docker compose down
```

### Локально

```bash
docker compose up -d postgres redis
npm run db:migrate
npm run dev          # app
npm run worker       # отдельный процесс
```

Стоп: Ctrl+C процессы; `docker compose stop postgres redis`.

## Миграции

```bash
npm run db:generate   # после изменения db/schema.ts
npm run db:migrate
# или npm run db:push  # только dev
```

## Sync (NVD / BDU)

1. UI `/app/settings/sync` или API `POST /api/sync/nvd|bdu` (когда появятся).
2. Проверить `sync_states` и логи worker.
3. При сбое BDU URL — upload fallback.

Wave 0: enqueue/UI не реализованы; worker только объявляет очереди.

## Сканы

1. Allowlist содержит target.
2. Создать scan job (тип + target).
3. Следить `scan_jobs.status` и `storage/reports/<id>/`.
4. При `failed` — поле `error` + логи worker.

## Логи

| Источник | Как смотреть |
|----------|--------------|
| app (compose) | `docker compose logs -f app` |
| worker | `docker compose logs -f worker` / stdout pino |
| postgres | `docker compose logs postgres` |
| redis | `docker compose logs redis` |

Worker Wave 0 пишет: `worker ready (Wave 0 stub — no processors registered)`.

## Health (практика)

```bash
# Postgres
docker compose exec postgres pg_isready -U vuln -d vuln
# Redis
docker compose exec redis redis-cli ping
# App
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```
