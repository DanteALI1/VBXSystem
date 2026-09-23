# Findings

Finding — факт обнаружения (сканер или ручная фиксация) на активе, опционально связанный с записью каталога `Vulnerability`.

## Список (`/app/findings`)

Плотная таблица. Колонки: **status**, **severity**, **title**, **asset**, **CVE/BDU**, **scan job**, **updated**; для `analyst+` — row action смены статуса.

Фильтры: `status`, `severity`, текстовый поиск (`q` по title/CVE/BDU/asset), query-параметры корреляции `vulnerabilityId` / `cveId` / `bduId` / `assetId`.

Роли: чтение `viewer+`; смена статуса `analyst+`.

## Статусы и переходы

Статусы (enum БД `finding_status`):

| Status | Meaning |
|--------|---------|
| `open` | Активный, требует триажа |
| `fixed` | Устранено |
| `accepted` | Принятый риск |
| `false_positive` | Ложное срабатывание |

Допустимы переходы между любыми статусами (включая регресс `fixed` → `open`). Неизвестный status → **400** `VALIDATION_ERROR` (TC-014). Viewer PATCH → **403**.

`updatedAt` обновляется при каждом успешном PATCH.

## Корреляция на карточке уязвимости

Секция **Related Findings** на `/app/vulnerabilities/[id]` выбирает findings по:

1. `findings.vulnerabilityId = id`, **или**
2. `findings.cveId = vulnerability.cveId` (если задан), **или**
3. `findings.bduId = vulnerability.bduId` (если задан).

Ссылка «Open in Findings» передаёт те же идентификаторы в query-параметры списка.

## Деталь / evidence

- `rawEvidence` (json из сканера) — на GET `/api/findings/:id`.
- Связь vulnerability (deep link в каталог).
- Asset / scan job.

## Создание

1. Автоматически из ingest nmap/nuclei (Wave 3 scan agent — out of scope этого UI-пакета).
2. Seed helper: `src/lib/findings/seed-sample-findings.ts` для демо-данных.
3. Ручное создание analyst+ — TODO.

## Дедуп

Ключ ориентира: `(assetId, serviceId?, vulnerabilityId|title fingerprint)`. Повторный скан обновляет evidence, не создаёт дубль open-finding (контракт ingest).

## Dashboard

Счётчик open findings — TC-016 (`status = open`).

## API

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/findings` | viewer+ |
| GET | `/api/findings/:id` | viewer+ |
| PATCH | `/api/findings/:id` | analyst+ (`{ status }`) |

Query list: `q`, `status`, `severity`, `assetId`, `vulnerabilityId`, `cveId`, `bduId`, `page`, `pageSize`.

TODO: bulk status, SLA, экспорт, audit trail смены статуса.
