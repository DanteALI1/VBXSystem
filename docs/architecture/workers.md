# Workers (BullMQ)

Точка входа: [`worker/index.ts`](../../worker/index.ts). Запуск: `npm run worker` (сервис `worker` в docker-compose).

## Очереди

| Имя очереди | Назначение | Статус Wave 0 |
|-------------|------------|---------------|
| `nvd-sync` | Инкрементальная/оконная синхронизация NVD → `vulnerabilities` + `vulnerability_sources` | stub (Queue создана, processor нет) |
| `bdu-sync` | Загрузка/парсинг BDU XML → upsert + link CVE | stub |
| `scan` | Запуск адаптера сканера по `scan_jobs` | stub |

Redis: `REDIS_URL` (compose: `redis://redis:6379`, локально часто `redis://localhost:6379`).

## Контракт job payload (план)

### `nvd-sync`

```ts
// TODO: финализировать при реализации processor
{
  triggeredBy?: string;      // user id
  days?: number;             // override NVD_SYNC_DAYS
  force?: boolean;
}
```

Поведение:

1. Выставить `sync_states` (`source=nvd`) → `running`.
2. Запросить NVD API за окно `NVD_SYNC_DAYS` (default из env).
3. Upsert по `cve_id` (идемпотентно).
4. Сохранить raw в `vulnerability_sources.raw_json`.
5. Обновить `cursor` / `last_success_at` / `status`.

### `bdu-sync`

```ts
{
  triggeredBy?: string;
  uploadedPath?: string;     // fallback: локальный XML вместо URL
}
```

Поведение:

1. Скачать `BDU_XML_URL` **или** взять upload.
2. Посчитать `file_hash`; пропуск если hash совпал и `!force`.
3. Парсить XML → upsert по `bdu_id`, линковать `cve_id` при наличии.
4. `raw_xml` / `external_url` в `vulnerability_sources`.

### `scan`

```ts
{
  scanJobId: string;
}
```

Поведение:

1. Загрузить `scan_jobs`, проверить allowlist ещё раз (defense in depth).
2. `status=running`, вызвать адаптер по `type`.
3. Записать отчёт в `storage/reports/{scanJobId}/...`.
4. Парсить → `services` / `findings`, `status=succeeded|failed`.

## Adapter pattern (сканеры)

Интерфейс (план, см. [ADR-003](../decisions/ADR-003-scan-adapters.md)):

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
| nmap | host/IP (+ options) | XML → ports/services + optional vulns |
| nuclei | URL/host | JSONL → findings + CVE |
| zap | URL | TODO Wave N |
| openvas | host | TODO Wave N |

## Rate limits — NVD

- Без `NVD_API_KEY`: жёсткий лимит публичного API → обязательный backoff/retry с jitter.
- С ключом: повышенный лимит; всё равно уважать `Retry-After` / 429.
- Unit-контракт: [TC-006](../testing/cases/TC-006-nvd-rate-limit-backoff.md).

## BDU download

- Primary: HTTP GET `BDU_XML_URL` (см. `.env.example`).
- Fallback: ручная загрузка файла админом → путь в job `uploadedPath` ([TC-008](../testing/cases/TC-008-bdu-upload-fallback.md)).
- Хранение временного файла под `storage/` (точный subpath — TODO при реализации).

## Report storage path

Compose монтирует:

```
./storage              → /app/storage
./storage/reports      → /app/storage/reports
```

Конвенция (план):

```
storage/reports/<scan_job_id>/raw.<ext>
storage/reports/<scan_job_id>/meta.json
```

App **не** выполняет сканы; только читает статусы/метаданные из БД и при необходимости отдаёт артефакты из storage.
