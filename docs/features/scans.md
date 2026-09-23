# Сканы

Маршрут UI: `/app/scans`  
API: `GET|POST /api/scans`, `GET /api/scans/:id`  
Код: `lib/scans/`, `lib/scanners/`, `worker/processors/scan.ts`

## Контракт

Таблица `scan_jobs` (`db/schema.ts`):

| Поле | Тип / значения |
|------|----------------|
| `type` | `nmap` \| `nuclei` \| `zap` \| `openvas` |
| `status` | `queued` → `running` → `succeeded` \| `failed` |
| `target` | строка цели (IP / host / URL) |
| `options_json` | JSON object (например `{ "fixture": true }`) |
| `error` | текст при `failed` |
| `created_by` | user id или `null` |
| `started_at` / `finished_at` / `created_at` | timestamps |

## Flow

1. UI/API: `createAndEnqueueScan` → **allowlist** (`listEnabledAllowlistRules` + `isTargetAllowed`).
2. При отказе allowlist → **400** `ScanAllowlistError`, строка `scan_jobs` **не** создаётся.
3. При успехе: insert `status=queued` → `enqueueScanJob({ scanJobId })` в очередь BullMQ `scan` → HTTP **202** `{ id, status: "queued" }`.
4. App **не** запускает бинарь; только enqueue.
5. Worker (`runScanJob`): defense-in-depth allowlist → `running` → `ScannerAdapter.start` → parse → `persistFindingDrafts` → `succeeded` \| `failed`.
6. Сырой отчёт: `storage/reports/<scanJobId>/`.
7. UI `/app/scans`: таблица статусов, ошибка, диалог создания (analyst|admin).

Если Redis недоступен на enqueue: job помечается `failed` с текстом ошибки enqueue, ошибка пробрасывается наверх (обычно **500**).

## GET `/api/scans`

Auth: любая роль с сессией.

Query:

| Param | Описание |
|-------|----------|
| `type` | фильтр enum; неизвестное значение игнорируется |
| `status` | фильтр enum; неизвестное игнорируется |
| `page` | default `1` |
| `pageSize` | default `25`, max `100` |

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "nmap",
      "status": "succeeded",
      "target": "10.0.1.10",
      "options": { "fixture": true },
      "error": null,
      "createdBy": "uuid-or-null",
      "startedAt": "ISO|null",
      "finishedAt": "ISO|null",
      "createdAt": "ISO"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25
}
```

## GET `/api/scans/:id`

Auth: сессия. **404** если нет.

Дополнительно к элементу списка:

```json
{
  "findingsCount": 4,
  "reportDir": "/abs/path/storage/reports/<id>"
}
```

`reportDir` — абсолютный путь, если каталог читаем; иначе `null` (ещё не создан / нет прав).

## POST `/api/scans`

Body (Zod `createScanSchema`):

```json
{ "type": "nmap", "target": "10.0.1.10", "options": { "fixture": true } }
```

- `options` опционален, default `{}`.
- Require `canCreateScan` (analyst|admin); иначе **403**.
- Target вне **enabled** allowlist → **400**, текст содержит `allowlist`; job **не** создаётся (TC-011).
- Успех → **202** `{ "id": "<uuid>", "status": "queued" }`.

UI-диалог по умолчанию: type `nmap`, target `10.0.1.10`, checkbox fixture = on → `options.fixture: true`.

## Fixture mode (nmap / nuclei)

Решение в `shouldUseFixtureMode` (`lib/scanners/fixture.ts`). Fixture включается, если **хотя бы одно** истинно:

1. `options.fixture === true`, **или**
2. env `SCAN_FIXTURE_MODE` ∈ `1` \| `true` \| `yes` (case-insensitive), **или**
3. бинарь не найден: `nmap` / `nuclei` на `PATH`, либо override `NMAP_BIN` / `NUCLEI_BIN` (файл должен быть executable; иначе считается missing → fixture).

При fixture meta.json содержит `reason`: `options.fixture` \| `binary_missing` \| `SCAN_FIXTURE_MODE`.

Фикстуры:

| Type | Source | Raw file |
|------|--------|----------|
| nmap | `tests/fixtures/nmap-sample.xml` | `storage/reports/<id>/raw.xml` |
| nuclei | `tests/fixtures/nuclei-sample.jsonl` | `storage/reports/<id>/raw.jsonl` |

Всегда пишется `storage/reports/<id>/meta.json`.

### Live binary (без fixture)

| Adapter | Binary | Args (упрощённо) |
|---------|--------|------------------|
| nmap | `NMAP_BIN` или `nmap` | `-oX <raw.xml> -sV --open <target>` |
| nuclei | `NUCLEI_BIN` или `nuclei` | `-u <target> -jsonl -o <raw.jsonl> -silent` |

Timeout команды: 120s (`runCommand`).

## Stubs (zap / openvas)

**Важно:** stubs **не** смотрят `SCAN_FIXTURE_MODE` и отсутствие бинаря. Только явный `options.fixture === true`.

| Режим | Результат |
|-------|-----------|
| без `options.fixture` | job **failed**, `error` ≈ `zap adapter not implemented in MVP` / `openvas …` |
| `options.fixture: true` | **succeeded**, 0 findings; raw stub (`raw.json` = `[]` / `raw.xml` = `<openvas/>`) |

## Persist

`persistFindingDrafts` (`lib/scanners/persist.ts`):

1. Резолв/создание asset по IP или hostname цели (`resolveAssetForTarget`); при отсутствии — auto-create.
2. Upsert `services` по `(assetId, port, protocol)` для drafts с `service` (типично nmap).
3. Insert `findings` (`status=open`); `vulnerabilityId` — lookup каталога по `cveId` (если есть).
4. CVE в finding нормализуется в UPPERCASE.

## Ожидаемые counts из sample fixtures (parse)

| Scanner | Findings | Services |
|---------|----------|----------|
| nmap | 4 (3 open ports + 1 script vuln CVE-2021-44228); closed 3306 пропускается | 3 (22, 80, 443) |
| nuclei | 5 валидных JSONL; 1 broken line skipped | — |

## Allowlist

- CRUD: `/app/settings/allowlist`, API `/api/allowlist` (**admin** write).
- `seed:assets` создаёт lab hosts (`10.0.1.10` и др.), **но не** правило allowlist.
- Перед сканом нужно enabled правило, покрывающее target (типично CIDR `10.0.0.0/8`). Скриншот-скрипт создаёт его через API при пустом списке.
- Gate: API до insert + worker re-check. Worker fail при reject пишет `status=failed` + `error` (защита, если правила изменили после enqueue).

## Smoke

```bash
# Prefetch: allowlist с 10.0.0.0/8 enabled + (желательно) seed assets
npm run seed:assets

# Inline smoke — БЕЗ BullMQ, вызывает runScanJob напрямую
# (не double-run, даже если worker уже запущен)
npm run smoke:scan
```

Ожидание: `scan_jobs.status=succeeded`, findings ≈ 4, services ≈ 3, sample titles в stdout.

Очередь через worker:

```bash
# terminal A
npm run worker

# terminal B — session cookie / curl после login
curl -X POST "$APP_URL/api/scans" \
  -H 'Content-Type: application/json' \
  -d '{"type":"nmap","target":"10.0.1.10","options":{"fixture":true}}'
```

Отчёты: `storage/reports/<id>/raw.xml` + `meta.json`.

## Тесты

| TC | Где |
|----|-----|
| TC-011 allowlist reject | `tests/unit/scan-allowlist.test.ts` |
| TC-012 nmap fixture | `tests/unit/nmap-parse.test.ts`, `nmap-persist.test.ts` |
| TC-013 nuclei fixture | `tests/unit/nuclei-parse.test.ts`, `nuclei-persist.test.ts` |

ADR: [ADR-003](../decisions/ADR-003-scan-adapters.md).
