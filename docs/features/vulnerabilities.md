# Уязвимости

Маршруты UI:

- Список: `/app/vulnerabilities`
- Деталь: `/app/vulnerabilities/[id]`

## Контракт данных

Запись `vulnerabilities` + связанные `vulnerability_sources` (`nvd` / `bdu`). Поля — [data-model](../architecture/data-model.md).

Ключевые идентификаторы:

- `cve_id` — уникальный, upsert NVD
- `bdu_id` — уникальный, upsert BDU
- `severity`, `cvss_score`, `published_at`, `modified_at`

## API

### `GET /api/vulnerabilities`

Требует сессию (`401` без неё).

Query:

| Параметр | Описание |
|----------|----------|
| `q` | поиск по `title`, `cveId`, `bduId` (ILIKE) |
| `severity` | одно значение или несколько (`critical,high` / повтор параметра) |
| `source` | `nvd` \| `bdu` (через exists по `vulnerability_sources`) |
| `page` | страница, default `1` |
| `pageSize` | размер страницы, default `25`, max `100` |

Ответ:

```json
{
  "items": [
    {
      "id": "…",
      "cveId": "CVE-…",
      "bduId": "BDU:…",
      "title": "…",
      "description": "…",
      "severity": "critical",
      "cvssScore": 10.0,
      "publishedAt": "…",
      "modifiedAt": "…",
      "createdAt": "…",
      "updatedAt": "…",
      "sources": ["nvd", "bdu"]
    }
  ],
  "total": 6,
  "page": 1,
  "pageSize": 25
}
```

Реализация: `lib/vulnerabilities/queries.ts`, маршрут `app/api/vulnerabilities/route.ts`.

### `GET /api/vulnerabilities/[id]`

Требует сессию. Ответ — деталь с `sources[]`:

```json
{
  "id": "…",
  "cveId": "…",
  "bduId": "…",
  "title": "…",
  "description": "…",
  "severity": "high",
  "cvssScore": 7.5,
  "publishedAt": "…",
  "modifiedAt": "…",
  "sources": [
    {
      "id": "…",
      "source": "nvd",
      "externalUrl": "https://nvd.nist.gov/…",
      "syncedAt": "…"
    }
  ]
}
```

`404` если запись не найдена.

## Список (UI)

- TanStack Table (`@tanstack/react-table` v9 `useTable`)
- Фильтры: search input, severity select, source select (URL search params)
- Dense internal tool layout, `SeverityBadge`
- Компоненты: `components/vulnerabilities/*`

## Деталь (UI)

- Блоки Identifiers, CVE/NVD, BDU
- Даже при одном источнике показываются оба блока (незаполненные поля — `—`)
- Список всех `vulnerability_sources` с `externalUrl` / `syncedAt`

## Seed

```bash
npm run seed:vulns
```

Скрипт `scripts/seed-vulnerabilities.ts` — идемпотентный upsert по `cveId` / `bduId`, ≥5 записей, смесь severity, минимум одна запись с обоими ID и двумя `vulnerability_sources` (NVD+BDU). Фрагмент NVD для справки: `tests/fixtures/nvd-sample.json`.

## Синхронизация

Запуск только через enqueue (`nvd-sync` / `bdu-sync`), роли admin/analyst. Viewer — запрет (TC-002, TC-015). Wave 2.

## Тесты

- TC-003, TC-004, TC-005, TC-006, TC-007, TC-008
