# Sync (NVD + BDU)

Маршрут UI: `/app/settings/sync`  
Код: `lib/nvd/*`, `lib/bdu/*`, `lib/sync/*`, `worker/processors/{nvd,bdu}.ts`  
См. также: [workers](../architecture/workers.md), [runbook](../ops/runbook.md), [configuration](../setup/configuration.md).

## Контракт HTTP

Очереди BullMQ `nvd-sync` / `bdu-sync` обрабатываются отдельным процессом (`npm run worker`). HTTP-хендлеры **только enqueue** — download/parse/upsert не блокируют запрос.

| Действие | Роль | API | Ответ |
|----------|------|-----|-------|
| Sync NVD | admin (`canTriggerSync`) | `POST /api/sync/nvd` | `202 { jobId }` |
| Sync BDU (download URL) | admin | `POST /api/sync/bdu` | `202 { jobId }` |
| Upload BDU XML | admin | `POST /api/sync/bdu/upload` multipart `file` | `202 { jobId, uploadedPath }` |
| Статус | any authenticated | `GET /api/sync/status` | `sync_states` + recent jobs |

- Viewer / analyst на POST → **403** (TC-002).
- Повторный enqueue при `sync_states.status === "running"` → **409** (`NVD sync already running` / `BDU sync already running`).
- Без сессии → **401**.

### Body (JSON, optional)

**NVD** (`POST /api/sync/nvd`):

```json
{ "days": 7, "mode": "fixture", "force": true }
```

| Поле | Тип | Эффект |
|------|-----|--------|
| `days` | number > 0 | Override окна `NVD_SYNC_DAYS` для этого job |
| `mode` | `"live"` \| `"fixture"` | Override `NVD_SYNC_MODE` |
| `force` | boolean | Принимается в payload; **в Wave 2 NVD-процессор его не использует** (нет hash-skip у NVD) |

**BDU** (`POST /api/sync/bdu`):

```json
{ "mode": "fixture", "force": true }
```

| Поле | Тип | Эффект |
|------|-----|--------|
| `mode` | `"live"` \| `"fixture"` | Override `BDU_SYNC_MODE` |
| `force` | boolean | Игнорировать совпадение `file_hash` и перепарсить |

**Upload** (`POST /api/sync/bdu/upload`): `multipart/form-data`

- обязательное поле `file` (непустой XML);
- опционально `force=true` / `force=1`;
- файл сохраняется в `storage/bdu/upload-<ts>-<safeName>`;
- job получает `uploadedPath` → режим `upload` (без HTTP download).

---

## SyncState (`sync_states`)

Таблица: одна строка на источник (`source` ∈ `nvd` | `bdu`, unique).

| Поле | Смысл |
|------|--------|
| `status` | `idle` → `running` → `succeeded` \| `failed` |
| `last_sync_at` | Время последнего старта/завершения попытки |
| `last_success_at` | Время последнего успешного завершения |
| `cursor` | NVD: ISO end окна (`lastModEndDate`); BDU обычно не трогает |
| `file_hash` | BDU: SHA-256 содержимого XML; NVD не пишет |
| `token` | Зарезервировано (Wave 2 не использует) |
| `meta_json` | JSON-снимок результата или `{ lastError }` при fail |

Хелперы: `ensureSyncState`, `markSyncRunning`, `markSyncSucceeded`, `markSyncFailed`, `getSyncStates` (`lib/sync/state.ts`).

### `meta_json` после успеха

**NVD:**

```json
{
  "upserted": 12,
  "inserted": 10,
  "updated": 2,
  "pages": 1,
  "mode": "fixture",
  "window": { "start": "...", "end": "..." }
}
```

В fixture `window` = `null`. `cursor` = `window.end` (live) или текущий ISO.

**BDU (полный прогон):**

```json
{
  "upserted": 3,
  "inserted": 1,
  "updated": 1,
  "merged": 1,
  "skipped": 0,
  "mode": "live",
  "path": "/app/storage/bdu/vulxml-….xml"
}
```

**BDU (hash unchanged, `!force`):**

```json
{ "skippedUnchanged": true, "mode": "live", "path": "…" }
```

Счётчики upsert при skip = 0; `status` всё равно `succeeded`.

**Fail:** предыдущий `meta_json` сохраняется, добавляется `lastError: "<message>"`, `status=failed`.

### `GET /api/sync/status`

```json
{
  "nvd": { "source": "nvd", "status": "succeeded", "lastSyncAt": "…", "lastSuccessAt": "…", "cursor": "…", "fileHash": null, "metaJson": { } },
  "bdu": { "…": "…" },
  "jobs": {
    "nvd": { "id": "…", "name": "nvd-sync", "state": "completed", "timestamp": 0, "finishedOn": 0, "failedReason": null },
    "bdu": null
  }
}
```

Блок `jobs` берётся из BullMQ (`getRecentJobInfo`). Если Redis недоступен — `jobs.*.` остаются `null`, строки `sync_states` всё равно возвращаются.

---

## NVD

### Источник

- API: `GET https://services.nvd.nist.gov/rest/json/cves/2.0` (`NvdClient`, `lib/nvd/client.ts`)
- Опциональный заголовок `apiKey` из `NVD_API_KEY`
- Query: `startIndex`, `resultsPerPage` (default **2000**), `lastModStartDate`, `lastModEndDate` (ISO-8601 UTC)

### Окно и пагинация

1. Окно: `[now - days, now]`, где `days` = job.`days` || `NVD_SYNC_DAYS` (default **30**).
2. `paginate()` крутит `startIndex` пока `startIndex < totalResults`.
3. Каждая страница мапится (`mapNvdCveItem`) и upsert-ится по `cve_id`.

### Rate limit / backoff

| Условие | Поведение |
|---------|-----------|
| Нет API key | Пауза ~**6 s** между успешными запросами (`NVD_NO_KEY_PAUSE_MS`) |
| HTTP **429** | До **5** retries; wait = `Retry-After` (секунды или HTTP-date) или exponential `2s·2^attempt` + jitter (cap 60s) |
| HTTP **5xx** | Тот же backoff, до `maxRetries` |
| Прочие 4xx | Сразу throw |

Unit: [TC-006](../testing/cases/TC-006-nvd-rate-limit-backoff.md) → `tests/unit/nvd-backoff.test.ts`.

### Upsert

- Ключ: `vulnerabilities.cve_id`.
- При update **сохраняется** существующий `bdu_id`.
- CVSS: предпочтение v3.1 → v3.0 → v2; severity через `parseSeverity`.
- Title: усечённое EN description (≤160) или сам CVE id.
- Source row: `vulnerability_sources(source=nvd)` с `raw_json`, `external_url=https://nvd.nist.gov/vuln/detail/<CVE>`, `synced_at`.

Идемпотентность: [TC-005](../testing/cases/TC-005-nvd-upsert-idempotent.md).

### Fixture mode

- Job `{ mode: "fixture" }` **или** env `NVD_SYNC_MODE=fixture`.
- Читает `tests/fixtures/nvd-fragment.json` (без сети).
- Одна «страница», дальше тот же upsert/SyncState путь.

Демо/smoke: `npm run smoke:sync` (требует Redis + worker + БД).

---

## BDU

### Источники XML (приоритет в `runBduSync`)

1. **upload** — если в job есть `uploadedPath` (API upload или ручная постановка).
2. **fixture** — `mode: "fixture"` или `BDU_SYNC_MODE=fixture` → `tests/fixtures/bdu-mini.xml`.
3. **live** — HTTP GET `BDU_XML_URL` (default `https://bdu.fstec.ru/files/documents/vulxml.xml`) → файл в `storage/bdu/vulxml-<ts>.xml`.

При ошибке download (`BDU download failed: HTTP …`) job падает → `status=failed`. Оператор использует **upload fallback** ([TC-008](../testing/cases/TC-008-bdu-upload-fallback.md)).

### Hash skip

Перед парсом считается SHA-256 содержимого. Если `file_hash` в `sync_states` совпал и `force` не задан — парсинг пропускается (`skippedUnchanged: true`).

### Parse

`parseBduXml` (`fast-xml-parser`): узлы `<vul>` / корневой `vulnerabilities`.

Извлекается: `identifier`/`bdu_id`, name/title, description, severity/danger, cvss, cve (`CVE-YYYY-…`), vendor/product из `vulnerable_software`, status. Битые узлы → `skipped++`, файл целиком не валится.

### Upsert / merge

| Ситуация | `action` |
|----------|----------|
| Нет строки по BDU и нет по CVE | `inserted` |
| Есть по BDU или по CVE (одна цель) | `updated` |
| Есть отдельная BDU-only и отдельная NVD CVE, разные id | `merged` — source rows переносятся на CVE-строку, BDU-row удаляется |

Source: `vulnerability_sources(source=bdu)` с `raw_xml`, `external_url=https://bdu.fstec.ru/vul/<numeric>`, `synced_at`.

Парс + CVE link: [TC-007](../testing/cases/TC-007-bdu-xml-parse-cve-link.md).

---

## Очереди и worker

| Очередь | Processor | concurrency | attempts |
|---------|-----------|-------------|----------|
| `nvd-sync` | `worker/processors/nvd.ts` → `runNvdSync` | 1 | 1 |
| `bdu-sync` | `worker/processors/bdu.ts` → `runBduSync` | 1 | 1 |
| `scan` | `worker/processors/scan.ts` → `runScanJob` | 1 | 1 |

Enqueue: `enqueueNvdSync` / `enqueueBduSync` (`lib/sync/queues.ts`). Job names: `nvd-sync` / `bdu-sync`.

Поток:

```
UI/API (admin) → ensureSyncState + 409 guard → Queue.add
       → Worker picks job → markSyncRunning → fetch/parse/upsert
       → markSyncSucceeded | markSyncFailed → return result / throw
```

Подробнее: [architecture/workers.md](../architecture/workers.md).

---

## Операции

| Сценарий | Команда / действие |
|----------|-------------------|
| Fixture smoke end-to-end | terminal A: `npm run worker`; terminal B: `npm run smoke:sync` |
| Live NVD (короткое окно) | UI Sync или `POST` с `{ "days": 1 }` + `NVD_API_KEY` |
| BDU без egress | `POST /api/sync/bdu/upload` с локальным vulxml |
| Смотреть состояние | UI Sync / `GET /api/sync/status` / SQL `SELECT * FROM sync_states` |

Runbook: [ops/runbook.md](../ops/runbook.md). Troubleshooting (429, Redis, stuck job): [ops/troubleshooting.md](../ops/troubleshooting.md).

---

## Тесты

| TC | Покрытие |
|----|----------|
| TC-002 | viewer cannot trigger sync |
| TC-005 | NVD upsert idempotent — `tests/unit/nvd-upsert.test.ts` |
| TC-006 | NVD backoff — `tests/unit/nvd-backoff.test.ts` |
| TC-007 | BDU parse + CVE link — `tests/unit/bdu-parse.test.ts` |
| TC-008 | BDU upload fallback |
| TC-015 | Sync settings enqueue jobs |
