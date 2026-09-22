# Workers (BullMQ)

Точка входа: [`worker/index.ts`](../../worker/index.ts).  
Запуск: `npm run worker` (сервис `worker` в docker-compose).  
Синхронизация: [features/sync.md](../features/sync.md).

При старте создаются три worker’а, логируется:

```text
worker ready — processors registered
queues: ["nvd-sync", "bdu-sync", "scan"]
```

SIGINT/SIGTERM: `worker.close()` + `connection.quit()` для всех трёх.

## Очереди

| Имя | Processor | concurrency | attempts (defaultJobOptions) | Статус Wave 2 |
|-----|-----------|-------------|------------------------------|---------------|
| `nvd-sync` | `worker/processors/nvd.ts` | 1 | 1 | полный `runNvdSync` |
| `bdu-sync` | `worker/processors/bdu.ts` | 1 | 1 | полный `runBduSync` |
| `scan` | `worker/processors/scan.ts` | 1 | (очередь default) | **stub**: ack + log, без адаптеров |

Redis: `REDIS_URL` через `createRedisConnection()` (`maxRetriesPerRequest: null` — требование BullMQ).  
App и worker должны указывать один и тот же Redis.

Очереди на стороне API: `getNvdQueue` / `getBduQueue` / `getScanQueue` (`lib/sync/queues.ts`) — `removeOnComplete: 50`, `removeOnFail: 100`.

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

### `scan` (stub)

```ts
{ /* произвольные данные; Wave 2 не парсит */ }
```

Processor только логирует `scan job received (stub — no adapter)` и возвращает `{ stub: true }`. Реальный поток — Wave 3 / [ADR-003](../decisions/ADR-003-scan-adapters.md).

---

## Adapter pattern (сканеры, план)

```ts
interface ScanAdapter {
  type: "nmap" | "nuclei" | "zap" | "openvas";
  run(ctx: {
    target: string;
    options: unknown;
    reportDir: string;
  }): Promise<{ rawPath: string; findings: ParsedFinding[]; services?: ParsedService[] }>;
}
```

| Адаптер | Вход | Выход |
|---------|------|-------|
| nmap | host/IP | XML → ports/services |
| nuclei | URL/host | JSONL → findings |
| zap / openvas | — | TODO |

Планируемый runtime flow (ещё не в коде processor):

1. Загрузить `scan_jobs`, allowlist defense-in-depth.
2. `status=running`, адаптер по `type`.
3. Отчёт в `storage/reports/{scanJobId}/…`.
4. Парс → `services` / `findings`, финальный статус.

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

Конвенция (план Wave 3):

```
storage/reports/<scan_job_id>/raw.<ext>
storage/reports/<scan_job_id>/meta.json
```

App **не** выполняет сканы; только enqueue (будущее) и чтение статусов/метаданных.

---

## Smoke (fixture)

```bash
# terminal A
npm run worker

# terminal B
npm run smoke:sync
```

Эквивалент вручную (enqueue без wait):

```bash
npx tsx --env-file=.env -e "
import { enqueueNvdSync, enqueueBduSync } from './lib/sync/queues.ts';
console.log(await enqueueNvdSync({ mode: 'fixture', force: true }));
console.log(await enqueueBduSync({ mode: 'fixture', force: true }));
process.exit(0);
"
```

Статус: `GET /api/sync/status` или SQL `sync_states`.
