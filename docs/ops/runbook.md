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
npm run seed:vulns        # опционально — каталог уязвимостей
npm run seed:assets       # опционально — lab hosts (10.0.1.10 …)
npm run dev               # app :3000
npm run worker            # отдельный терминал — обязателен для sync и queue-сканов
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

- Seed assets: `npm run seed:assets` (hosts `10.0.1.10`, `10.0.1.20`, `10.0.2.5`). **Allowlist не сидится** этим скриптом.
- CRUD UI: `/app/assets`, `/app/settings/allowlist`.
- Перед сканами: admin создаёт enabled CIDR (типично `10.0.0.0/8`) или URL-правило, покрывающее target.
- Роли: analyst+ для assets write; **только admin** для allowlist write.

---

## Сканы

### Prefetch

1. Enabled allowlist rule, покрывающая target (например CIDR `10.0.0.0/8`).
2. Желательно `npm run seed:assets` (asset для `10.0.1.10` уже есть — иначе persist auto-создаст).
3. Worker запущен — **если** идёте через очередь / UI / `POST /api/scans`.

### Fixture smoke (inline, без BullMQ)

```bash
npm run smoke:scan
```

Скрипт `scripts/smoke-scan-fixture.ts`:

1. `assertTargetAllowed("10.0.1.10")` — иначе падает сразу.
2. Insert `scan_jobs` type=`nmap`, `optionsJson: { fixture: true }`.
3. Вызывает `runScanJob` **напрямую** (не enqueue) — безопасно при уже работающем worker.
4. Печатает status, findings/services counts, sample titles.

Ожидание: `status=succeeded`, findings ≈ 4, services ≈ 3.

### Через UI / API (очередь)

1. Войти как **analyst** или **admin**.
2. `/app/scans` → Create (default fixture on) **или**:

```bash
curl -X POST "$APP_URL/api/scans" \
  -H 'Content-Type: application/json' \
  -d '{"type":"nmap","target":"10.0.1.10","options":{"fixture":true}}'
# → 202 { "id": "<uuid>", "status": "queued" }
```

3. Worker: очередь `scan` → `runScanJob`.
4. Статус: UI, `GET /api/scans/:id`, SQL `scan_jobs`.
5. Findings: `/app/findings`, `GET /api/findings`.

### Fixture mode

| Условие (nmap/nuclei) | Эффект |
|-----------------------|--------|
| `options.fixture: true` | копия из `tests/fixtures/` |
| `SCAN_FIXTURE_MODE=1` (или `true`/`yes`) | то же для всех nmap/nuclei jobs |
| бинарь не найден (`nmap`/`nuclei` / `NMAP_BIN`/`NUCLEI_BIN`) | fallback на fixture |

zap/openvas: только явный `options.fixture: true` → empty success; иначе `failed` «not implemented in MVP».

### Пути отчётов

```
storage/reports/<scan_job_id>/raw.xml      # nmap (и openvas stub)
storage/reports/<scan_job_id>/raw.jsonl    # nuclei
storage/reports/<scan_job_id>/raw.json     # zap stub
storage/reports/<scan_job_id>/meta.json    # adapter, fixture, reason/binary
```

Compose volume: `./storage/reports` → `/app/storage/reports`.  
`GET /api/scans/:id` → поле `reportDir` (abs path или `null`).

### Failed

- Смотреть `scan_jobs.error` + логи worker (`scan job finished with failed status` / `scan job failed`).
- Allowlist reject на API → **400**, job не создаётся; на worker re-check → `failed` в БД.

См. [features/scans.md](../features/scans.md), [troubleshooting](troubleshooting.md).
---

## Логи

| Источник | Как смотреть |
|----------|--------------|
| app (compose) | `docker compose logs -f app` |
| worker | `docker compose logs -f worker` / stdout pino |
| postgres | `docker compose logs postgres` |
| redis | `docker compose logs redis` |

Успешный старт worker: `worker ready — processors registered`.  
Sync: `nvd-sync job started` → `nvd-sync job completed` (или `… failed`).  
Scan: `scan job started` → `scan job completed` (с `findingsCreated` / `fixture`) или `scan job finished with failed status`.
---

## Health (практика)

```bash
docker compose exec postgres pg_isready -U vuln -d vuln
docker compose exec redis redis-cli ping
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/api/sync/status   # 401 без cookie — ожидаемо
```
