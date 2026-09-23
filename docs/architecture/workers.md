# Workers (BullMQ)

Точка входа: [`worker/index.ts`](../../worker/index.ts).  
Запуск: `npm run worker` (сервис `worker` в docker-compose).  
Синхронизация: [features/sync.md](../features/sync.md).  
Сканы: [features/scans.md](../features/scans.md).

При старте создаются три worker’а, логируется:

```text
worker ready — processors registered
queues: ["nvd-sync", "bdu-sync", "scan"]
```

SIGINT/SIGTERM: `worker.close()` + `connection.quit()` для всех трёх.

## Очереди

| Имя | Processor | concurrency | attempts (defaultJobOptions) | Статус |
|-----|-----------|-------------|------------------------------|--------|
| `nvd-sync` | `worker/processors/nvd.ts` | 1 | 1 | полный `runNvdSync` |
| `bdu-sync` | `worker/processors/bdu.ts` | 1 | 1 | полный `runBduSync` |
| `scan` | `worker/processors/scan.ts` → `runScanJob` | 1 | 1 | полный adapter pipeline |

Redis: `REDIS_URL` через `createRedisConnection()` (`maxRetriesPerRequest: null` — требование BullMQ).  
App и worker должны указывать один и тот же Redis.

Очереди на стороне API: `getNvdQueue` / `getBduQueue` / `getScanQueue` (`lib/sync/queues.ts`) — `removeOnComplete: 50`, `removeOnFail: 100`, `attempts: 1`.

`enqueueScanJob` задаёт BullMQ `jobId = scanJobId` (идемпотентность по id строки `scan_jobs`).

---

## Поток процессора (NVD / BDU)

```
POST /api/sync/… (admin)
  → ensureSyncState; if status==running → 409
  → enqueue*Sync({ triggeredBy, … }) → BullMQ job id → 202

Worker (отдельный процесс)
  → Job started (pino)
  → runNvdSync / runBduSync
       markSyncRunning(source)
       fetch | fixture | upload
       upsert rows + vulnerability_sources
       markSyncSucceeded | markSyncFailed
  → return result  |  throw → job failed event
```

Concurrency **1** на очередь: не гоняем два NVD (или два BDU) параллельно в одном worker. Guard `409` на API дополнительно защищает от двойного enqueue при `running`.

Если worker **не** запущен: job остаётся в `waiting`, `sync_states` может ещё быть `idle`/`succeeded` от прошлой сессии — см. [troubleshooting](../ops/troubleshooting.md#job-stuck--worker-не-забирает).

---

## Job payload

### `nvd-sync` (job name `nvd-sync`)

```ts
{
  triggeredBy?: string;      // user id из сессии
  days?: number;             // override NVD_SYNC_DAYS
  force?: boolean;           // принимается API; Wave 2 runNvdSync не читает
  mode?: "live" | "fixture"; // иначе NVD_SYNC_MODE / live
}
```

Шаги `runNvdSync` (`lib/nvd/sync.ts`):

1. Resolve mode (job → env → live).
2. `markSyncRunning("nvd")`.
3. **fixture:** read `tests/fixtures/nvd-fragment.json`, одна страница upsert.
4. **live:** окно `days`, `NvdClient.paginate` (2000/page, pause/backoff), upsert каждой CVE.
5. `markSyncSucceeded` с `cursor` + `metaJson` **или** `markSyncFailed` + rethrow.

### `bdu-sync` (job name `bdu-sync`)

```ts
{
  triggeredBy?: string;
  uploadedPath?: string;     // приоритет → mode upload
  force?: boolean;           // игнор file_hash skip
  mode?: "live" | "fixture";
}
```

Шаги `runBduSync` (`lib/bdu/sync.ts`):

1. `ensureSyncState` → prior `fileHash`.
2. `markSyncRunning("bdu")`.
3. Источник XML: upload path → fixture → download URL.
4. SHA-256; если hash совпал и `!force` → success + `skippedUnchanged`.
5. Иначе parse → upsert/merge → success с counters.
6. На ошибке (в т.ч. download HTTP) → failed + rethrow.

Upload API заранее пишет файл через `saveUploadedBduXml` в `storage/bdu/`.

### `scan` (job name `scan`)

```ts
{ scanJobId: string }
```

Processor (`lib/scans/queries.ts` → `runScanJob`):

1. Загрузить `scan_jobs` по id (не найден → throw).
2. Allowlist defense-in-depth; при reject → `status=failed` + `error`, return (BullMQ job при этом **completed** с `status: failed` в результате — не throw).
3. `status=running`, `startedAt`.
4. `getScannerAdapter(type).start` → write `storage/reports/{scanJobId}/`.
5. `parse` → `FindingDraft[]` → `persistFindingDrafts` (services + findings + asset resolve).
6. `status=succeeded` **или** catch → `failed` + `error` (adapter exception тоже не роняет BullMQ throw из happy-path fail — возвращает result; uncaught только «job not found»).

Лог worker при success: `findingsCreated`, `servicesUpserted`, `fixture`.

Fixture mode (nmap/nuclei): `options.fixture` \| `SCAN_FIXTURE_MODE` \| binary missing.  
Stubs zap/openvas: fail unless **явный** `options.fixture: true` (env/binary **не** помогают).

См. [ADR-003](../decisions/ADR-003-scan-adapters.md), [scans feature](../features/scans.md).

---

## Adapter pattern (сканеры)

```ts
interface ScannerAdapter {
  readonly type: "nmap" | "nuclei" | "zap" | "openvas";
  start(ctx: { job; reportDir; options }): Promise<ScanReport>;
  parse(report: ScanReport): Promise<FindingDraft[]>;
}
```

Регистрация: `lib/scanners/registry.ts` (`getScannerAdapter`).

| Адаптер | Вход | Выход |
|---------|------|-------|
| nmap | host/IP | XML → ports/services + findings |
| nuclei | URL/host | JSONL → findings |
| zap / openvas | — | stub (fail / empty fixture) |

---

## Rate limits — NVD

- Без `NVD_API_KEY`: пауза ~6s между запросами + backoff на 429/5xx.
- С ключом: пауза между страницами не нужна; 429 всё равно обрабатывается.
- Unit: [TC-006](../testing/cases/TC-006-nvd-rate-limit-backoff.md).

## BDU download

- Primary: GET `BDU_XML_URL`.
- Fallback: admin upload → `uploadedPath` ([TC-008](../testing/cases/TC-008-bdu-upload-fallback.md)).
- Файлы: `storage/bdu/`.

## Report storage

```
./storage              → /app/storage
./storage/reports      → /app/storage/reports
```

Конвенция:

```
storage/reports/<scan_job_id>/raw.xml      # nmap, openvas stub
storage/reports/<scan_job_id>/raw.jsonl    # nuclei
storage/reports/<scan_job_id>/raw.json     # zap stub
storage/reports/<scan_job_id>/meta.json
```

`GET /api/scans/:id` отдаёт `reportDir`, если каталог существует и читаем.

App **не** выполняет сканы в HTTP-процессе; только enqueue и чтение статусов. CLI `npm run smoke:scan` — исключение: inline `runScanJob` без очереди.

---

## Smoke

```bash
# Sync fixtures
npm run worker          # terminal A
npm run smoke:sync      # terminal B

# Scan fixture (inline, worker не обязателен)
# нужен enabled allowlist на 10.0.0.0/8
npm run smoke:scan
```

Статус sync: `GET /api/sync/status` или SQL `sync_states`.  
Статус scan: SQL `scan_jobs` / UI `/app/scans` / `GET /api/scans/:id`.
