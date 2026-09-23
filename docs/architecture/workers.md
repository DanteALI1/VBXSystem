# Workers: NVD, BDU, Scan

Фоновые задачи выполняются через **BullMQ** на **Redis**. Продюсеры — API/сервисы Next.js; консьюмеры — отдельный процесс `pnpm worker` (или контейнер `workers`).

## Очереди

| Queue | Назначение | Concurrency (default) |
|-------|------------|------------------------|
| `sync:nvd` | Инкрементальная/полная синхронизация NVD API 2.0 | 1 |
| `sync:bdu` | Парсинг БДУ XML (download или upload) | 1 |
| `scan:jobs` | Выполнение ScanJob (nmap / nuclei) | 2 |
| `scan:ingest` | Парсинг артефактов → services/findings | 2 |

Имена могут иметь prefix `vbx:` через `BULLMQ_PREFIX`.

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

### Вход

- `mode`: `incremental` | `full`
- `lastModStartDate` / `lastModEndDate` (для incremental — из `SyncState.cursor`)
- опционально: `cveId` для точечного обновления

### Поведение

1. Читает `SyncState` source=`nvd`.
2. Вызывает NVD API 2.0 с `NVD_API_KEY` (если задан — выше rate limit).
3. При HTTP 403/429 — exponential backoff + jitter (см. TC-006); не помечает sync success.
4. Для каждой CVE: upsert `Vulnerability` по `cveId`, пишет `VulnerabilitySource`, обновляет `localSyncedAt`, CVSS → computed `severity`, KEV/EPSS если доступны в payload/обогащении.
5. Обновляет cursor и `lastSuccessAt`.

### Идемпотентность

Upsert по `cveId` и checksum raw; повторный прогон не создаёт дублей (TC-005).

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
# TODO Wave 1: точные скрипты
pnpm worker
# или
pnpm --filter worker start
```

Redis обязателен (`REDIS_URL`). Без workers UI работает, но sync/scan jobs остаются в `queued`.

## Связанные документы

- [ADR-003](../decisions/ADR-003-scan-adapters.md)
- [features/scans.md](../features/scans.md)
- [ops/runbook.md](../ops/runbook.md)
