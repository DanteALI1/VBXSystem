# Runbook

## Старт / стоп

### Docker Compose (полный стек)

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f app worker
docker compose down
```

Сервисы: `postgres`, `redis`, `app`, `worker`. Worker поднимается вместе со стеком.

### Локально

```bash
docker compose up -d postgres redis
npm run db:migrate
npm run bootstrap:admin   # один раз
npm run seed:vulns        # опционально
npm run seed:assets       # опционально
npm run dev               # app :3000
npm run worker            # отдельный терминал — обязателен для sync
```

Стоп: Ctrl+C процессы; `docker compose stop postgres redis`.

---

## Миграции

```bash
npm run db:generate   # после изменения db/schema.ts
npm run db:migrate
# или npm run db:push  # только dev
```

---

## Sync (NVD / BDU)

### Быстрый fixture smoke

```bash
# terminal A
npm run worker

# terminal B
npm run smoke:sync
```

Ожидание: оба `sync_states` → `succeeded`, в логе smoke — строки CVE-2099-0001 / BDU:2099-*.

### Через UI

1. Войти как **admin**.
2. Открыть `/app/settings/sync`.
3. Запустить NVD и/или BDU (live или fixture в зависимости от env / UI controls).
4. Статус обновляется через `GET /api/sync/status`.

### Через API

```bash
# после login cookie / session
curl -X POST "$APP_URL/api/sync/nvd" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"fixture"}'

curl -X POST "$APP_URL/api/sync/bdu" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"fixture","force":true}'

curl -X POST "$APP_URL/api/sync/bdu/upload" \
  -F 'file=@./tests/fixtures/bdu-mini.xml' \
  -F 'force=true'
```

Только admin; иначе `403`. При уже идущем sync — `409`.

### Как читать SyncState

| `status` | Значение |
|----------|----------|
| `idle` | Строка создана (`ensureSyncState`), ещё не было успешного/провального прогона в этой «сессии» жизни записи |
| `running` | Worker вошёл в `run*Sync` (`markSyncRunning`). Новый enqueue того же source → 409 |
| `succeeded` | Последний прогон ок; смотреть `last_success_at`, `cursor` (NVD), `file_hash` (BDU), `meta_json` |
| `failed` | Последний прогон упал; `meta_json.lastError` — текст ошибки |

Полезные поля `meta_json`:

- NVD: `upserted`, `inserted`, `updated`, `pages`, `mode`, `window`
- BDU: те же counters + `merged`, `skipped`, `skippedUnchanged`, `path`

SQL:

```sql
SELECT source, status, last_sync_at, last_success_at, cursor, file_hash, meta_json
FROM sync_states
ORDER BY source;
```

HTTP: `GET /api/sync/status` → `{ nvd, bdu, jobs: { nvd, bdu } }`.  
`jobs.*` — снимок последнего active/waiting/completed/failed job из BullMQ (может быть `null` если Redis down или очередь пуста).

Подробности контракта: [features/sync.md](../features/sync.md). Workers: [architecture/workers.md](../architecture/workers.md).

### Live NVD советы

- Задать `NVD_API_KEY` в `.env`.
- Первые прогоны: `{ "days": 1 }` или уменьшить `NVD_SYNC_DAYS`.
- Без ключа sync медленный (~6s между страницами).

### BDU без сети

Если download с `BDU_XML_URL` падает — использовать upload fallback (UI или `POST …/bdu/upload`). При повторной загрузке того же файла нужен `force=true`, иначе hash-skip.

---

## Assets / allowlist

- Seed: `npm run seed:assets`.
- CRUD UI: `/app/assets`, `/app/settings/allowlist`.
- Роли: analyst+ для assets write; **только admin** для allowlist write.

---

## Сканы (Wave 3)

1. Allowlist содержит target.
2. Создать scan job (тип + target) — API ещё в плане.
3. Следить `scan_jobs.status` и `storage/reports/<id>/`.
4. При `failed` — поле `error` + логи worker.

Worker очередь `scan` уже зарегистрирована как stub (jobs ack’аются без работы).

---

## Логи

| Источник | Как смотреть |
|----------|--------------|
| app (compose) | `docker compose logs -f app` |
| worker | `docker compose logs -f worker` / stdout pino |
| postgres | `docker compose logs postgres` |
| redis | `docker compose logs redis` |

Успешный старт worker: `worker ready — processors registered`.  
Job: `nvd-sync job started` → `nvd-sync job completed` (или `… failed`).

---

## Health (практика)

```bash
docker compose exec postgres pg_isready -U vuln -d vuln
docker compose exec redis redis-cli ping
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/api/sync/status   # 401 без cookie — ожидаемо
```
