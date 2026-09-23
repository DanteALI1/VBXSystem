# Workers: NVD, BDU, Scan

Фоновые задачи выполняются через **BullMQ** на **Redis**. Продюсеры — API/сервисы Next.js; консьюмеры — отдельный процесс `pnpm worker` (или контейнер `workers`).

## Очереди

| Queue | Назначение | Concurrency (default) |
|-------|------------|------------------------|
| `nvd-sync` | Инкрементальная/полная синхронизация NVD API 2.0 | 1 |
| `bdu-sync` | Парсинг БДУ XML (download или upload) | 1 |
| `scan` | Выполнение ScanJob (nmap / nuclei) + ingest | 1–2 |

Имена заданы в `src/lib/queue` (`QUEUE_NAMES`). Опциональный prefix через `BULLMQ_PREFIX` (TODO).

## Общий контракт job

```ts
type JobEnvelope<T> = {
  type: string;
  requestedByUserId?: string;
  requestedAt: string; // ISO
  payload: T;
};
```

Результат пишется в доменные таблицы + `SyncState` / статус `ScanJob`. Ошибки — retry с backoff; после max attempts — `failed` + `lastError`.

## NVD Sync Worker

**Код:** `src/lib/sync/nvd/*`, processor `src/workers/nvd/processor.ts`, enqueue `POST /api/settings/sync/nvd`.

### Вход

- `mode`: `incremental` | `full`
- `lastModStartDate` / `lastModEndDate` (для incremental — из `SyncState.cursor` или `NVD_SYNC_DAYS`)
- опционально: `cveId` для точечного обновления

### Поведение

1. Читает `SyncState` source=`nvd`; ставит `lastAttemptAt`.
2. Вызывает NVD API 2.0 (`NVD_API_BASE`); optional header `apiKey` из `NVD_API_KEY`.
3. Пагинация по `startIndex` / `resultsPerPage` / `totalResults`.
4. При HTTP 403/429 — exponential backoff + jitter (+ `Retry-After`); без ключа — пауза ~6s между успешными запросами (TC-006). Не обновляет `lastSuccessAt` при fail.
5. Для каждой CVE: upsert `Vulnerability` по `cveId`, пишет `VulnerabilitySource(nvd)`, `VulnerabilityHistory` при изменении полей, `localSyncedAt=now`, upstream `publishedAt`/`updatedAt`, CVSS → `severity` через `@/lib/domain/severity` (max across sources), vendors/products/CWE/CPE/refs/KEV/EPSS если есть.
6. Обновляет cursor (`lastModEndDate`) и `lastSuccessAt` + meta counts.

### Идемпотентность

Upsert по `cveId` + unique `(vulnerabilityId, source)`; повторный прогон не создаёт дублей (TC-005). Gate-тесты мокают HTTP поверх `tests/fixtures/nvd-fragment.json` — без реального NIST.

### Локальный запуск

```bash
pnpm worker
# enqueue (analyst+ session cookie):
curl -X POST "$APP_URL/api/settings/sync/nvd" -H "Content-Type: application/json" -d '{"mode":"incremental"}'
```

## BDU Sync Worker

### Вход

- `mode`: `download` | `upload`
- `filePath` или storage key для upload fallback
- опционально: force reparse

### Поведение

1. Получает XML (HTTP с официального зеркала **или** загруженный админом файл — TC-008).
2. Парсит записи БДУ (`fast-xml-parser`).
3. Извлекает идентификатор БДУ, описание, ссылки на CVE.
4. Upsert `Vulnerability` с `bduId`; при наличии CVE — link/merge с существующей записью по `cveId` (TC-007).
5. `VulnerabilitySource` source=`bdu`.
6. Обновляет `SyncState` source=`bdu`.

### Ошибки парсинга

Битые записи логируются и пропускаются; критичный fail файла — job `failed` с понятным `lastError`.

## Scan Worker

### Prefetch / gate

Перед постановкой и повторно в worker:

1. Резолв `target` → IP/CIDR/host.
2. Match против enabled `AllowlistTarget`.
3. Если вне allowlist → `ScanJob.status=failed`, `errorMessage=ALLOWLIST_REJECTED` (TC-011). **Не** запускать nmap/nuclei.

### Адаптеры

| type | Вход | Выход |
|------|------|-------|
| `nmap` | host/IP, ports profile | XML/JSON → Service upsert + soft findings |
| `nuclei` | host/URL, templates root | JSONL → Finding + optional CVE map |

**Nuclei policy (жёстко):**

- Разрешены только детектирующие templates из путей `cves/` и `vulnerabilities/`.
- Запрещены templates с auto-exploitation / intrusive tags (см. ADR-003).
- Запрещён произвольный `-t` вне whitelist директорий.

### Ingest

Очередь `scan:ingest` читает `artifactPath`, создаёт/обновляет `Service` и `Finding`, линкует `vulnerabilityId` по CVE из шаблона.

## Расписание

| Job | Триггер |
|-----|---------|
| NVD incremental | Cron env `NVD_SYNC_CRON` + кнопка в UI (analyst+) |
| BDU | Cron `BDU_SYNC_CRON` / ручной upload |
| Scan | Только ручной/API enqueue (нет массового internet-wide) |

Viewer **не** может enqueue sync/scan (TC-002).

## Наблюдаемость

- Структурированные логи pino: `queue`, `jobId`, `durationMs`, `upserted`, `skipped`.
- Метрики (TODO Wave 2): длина очереди, fail rate, last success age.

## Локальный запуск

```bash
pnpm worker
```

Redis обязателен (`REDIS_URL`). Без workers UI работает, но sync/scan jobs остаются в `queued`.

## Связанные документы

- [ADR-003](../decisions/ADR-003-scan-adapters.md)
- [features/scans.md](../features/scans.md)
- [ops/runbook.md](../ops/runbook.md)
