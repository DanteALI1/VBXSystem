# Troubleshooting

## App не стартует / 500

- Проверить `DATABASE_URL` и доступность Postgres.
- Проверить `AUTH_SECRET` и `APP_URL` (Better Auth).
- `npm run typecheck` / логи Next.js.
- Миграции применены? (`npm run db:migrate`).

## Не подключается к БД в Docker

- Host `postgres` работает **внутри** сети compose; с хоста — `localhost:5432`.
- Дождаться healthcheck: `docker compose ps`.
- Учётные: user/db/password `vuln` (см. compose + `.env.example`).

## Redis down / app и worker расходятся

Симптомы:

- enqueue sync → 500 или таймаут при `Queue.add`;
- `GET /api/sync/status` отдаёт SyncState, но `jobs.nvd` / `jobs.bdu` = `null`;
- worker: connection errors / reconnect loop.

Действия:

1. `REDIS_URL` **одинаковый** у app и worker (`redis://localhost:6379` локально, `redis://redis:6379` в compose).
2. `docker compose exec redis redis-cli ping` → `PONG`.
3. Убедиться, что в коде connection создаётся с `maxRetriesPerRequest: null` (уже в `createRedisConnection` — не менять на default ioredis).
4. После подъёма Redis перезапустить worker (`npm run worker` / compose restart worker).

Jobs, поставленные пока Redis был мёртв, могли не попасть в очередь — повторить POST sync.

## Job stuck / worker не забирает

Симптомы: API вернул `202 { jobId }`, `sync_states` долго `idle` или старый `succeeded`, UI «висит».

Проверить:

1. Процесс worker запущен и в логе есть `processors registered`.
2. Worker смотрит тот же Redis, что и app.
3. В BullMQ job в состоянии `waiting`/`delayed` (через `jobs` в `/api/sync/status` или RedisInsight).
4. Если `sync_states.status=running`, а worker умер mid-job — status **залипнет на `running`** (Wave 2 нет автоматического reset). Тогда:
   - поднять worker и дождаться fail/success **или**
   - вручную: `UPDATE sync_states SET status = 'failed', meta_json = jsonb_set(COALESCE(meta_json,'{}'), '{lastError}', '"manual reset"') WHERE source = 'nvd';`
   - после этого снова можно enqueue (409 снимется).

`attempts: 1` для nvd/bdu — автоматических ретраев BullMQ нет; rate-limit retries живут **внутри** `NvdClient`, не как re-queue.

## NVD 429 / медленный sync

- Задать `NVD_API_KEY` в `.env` и перезапустить worker.
- Уменьшить окно: `NVD_SYNC_DAYS=1` или body `{ "days": 1 }`.
- Без ключа пауза ~6s между страницами — на большом окне это часы.
- В логах worker при 429 будут паузы; после исчерпания retries: `NVD rate limited after N attempts` → `status=failed`, `meta_json.lastError`.
- Для CI/демо: `NVD_SYNC_MODE=fixture` или `{ "mode": "fixture" }` / `npm run smoke:sync`.
- Unit backoff: [TC-006](../testing/cases/TC-006-nvd-rate-limit-backoff.md).

## BDU download fail → upload

Симптомы: `BDU download failed: HTTP …` в `lastError`, `status=failed`.

1. Проверить egress до `BDU_XML_URL` (часто блокируется в sandbox/корпоративной сети).
2. Fallback: admin → UI allow upload или:

```bash
curl -X POST "$APP_URL/api/sync/bdu/upload" \
  -F "file=@/path/to/vulxml.xml" \
  -F "force=true"
```

3. Файл окажется в `storage/bdu/`; job с `uploadedPath` не ходит в сеть.
4. Если upload того же содержимого повторно без `force` — возможен `skippedUnchanged` (это success, не ошибка).
5. Fixture без файла с ФСТЭК: `BDU_SYNC_MODE=fixture` или `{ "mode": "fixture" }`.

TC: [TC-008](../testing/cases/TC-008-bdu-upload-fallback.md).

## Sync 409 Conflict

`NVD sync already running` / `BDU sync already running` — в БД `status=running`. Либо дождаться завершения, либо сбросить вручную после краша worker (см. stuck job).

## Viewer / analyst не может sync

Ожидаемо: `POST /api/sync/*` → **403** для non-admin (`canTriggerSync`). Read status — можно. TC-002.

## Миграции

- `db:migrate` падает → проверить `drizzle/` и `DATABASE_URL`.
- Не смешивать `db:push` и migrate на одной БД без понимания.

## Скан отвергнут (Wave 3)

- Target не в allowlist или правило `enabled=false`.
- Проверить `lib/domain/allowlist.ts` (CIDR/URL).
- Unit: `tests/unit/allowlist.test.ts`, TC-011.

## Логин не работает

- Bootstrap выполнен? `npm run bootstrap:admin`.
- Верный `APP_URL` (cookies / Better Auth baseURL).
- `AUTH_SECRET` задан.
- Rate-limit Better Auth на sign-in (≈3 / 10s) — подождать или использовать сохранённую session в e2e.

## Docker недоступен в среде агента

- Зафиксировать в PROGRESS/RESULTS; unit-тесты без Docker всё ещё runnable.
- Fixture sync требует хотя бы локальный Redis+Postgres (или compose только infra).
- Скрин A1 — `blocked` / note при отсутствии Docker.
