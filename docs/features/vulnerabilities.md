# Уязвимости (каталог)

Каталог CVE/БДУ — центральный экран консоли. UX ориентирован на **плотную table-first** консоль (паттерны IA из ADR-004), без копирования кода или бренда OpenCVE.

## Routes

| UI | API |
|----|-----|
| `/app/vulnerabilities` | `GET /api/vulnerabilities` |
| `/app/vulnerabilities/[id]` | `GET /api/vulnerabilities/:id` |
| — | `POST/DELETE /api/vulnerabilities/:id/tags[/:tagId]` |
| — | `GET/POST /api/tags` |
| — | `GET/POST /api/saved-views`, `PATCH/DELETE /api/saved-views/:id` |

## Список (List)

- Заголовок + счётчик «N vulnerabilities found».
- Поиск: keyword **или** advanced query + **Query Builder** (AND-only form → `field:value AND …`).
- Facet chips: Severity, Source, KEV, CVSS range, Vendor, Product, Tag, Date updated (`localSyncedAt`).
- Saved Views: Save / Load / Delete (payload JSON в колонке `query`, scope=`vulnerabilities`).
- Таблица (TanStack Table v9): sticky header; sortable `updated`(=`localSyncedAt`), `cvss`, `epss`, `cveId`; server-side pagination; row → detail.
- Колонки: ID (CVE/BDU), Vendors (count+tooltip), Products (count), Updated, CVSS v3.1 + severity badge, Sources NVD\|BDU, KEV, EPSS, Tags, Description snippet.
- Severity badge colors: Critical / High / Medium / Low / None (`@/lib/domain/severity`).

Роли (когда Auth подключён): `viewer`+ чтение; теги/views — `analyst`+; sync — Wave 2.

Page size: `VULN_PAGE_SIZE_DEFAULT` / `VULN_PAGE_SIZE_MAX`.

## Деталь (Detail)

Секции: Header; Description (метки NVD+BDU); Analysis placeholder; Affected table; Scoring; Weaknesses; References; Linked IDs; Related Findings (корреляция по vulnerabilityId / cveId / bduId); History timeline; Raw JSON collapsible.

## Advanced search syntax

Строка `field:value`. Лимит field-клауз: **`ADVANCED_SEARCH_MAX_FIELDS`** (default **5**). Превышение → 400 `SEARCH_TOO_COMPLEX`.

### Поля

| Поле | Пример |
|------|--------|
| `cve` | `cve:CVE-2024-1234` |
| `bdu` | `bdu:BDU:2024-*****` |
| `description` | `description:"remote code"` |
| `vendor` / `product` | `vendor:microsoft` |
| `cvss31` | `cvss31:>=9`, `cvss31:7.0-8.9` |
| `severity` | `severity:critical` |
| `kev` | `kev:true` |
| `epss` | `epss:>=0.5` |
| `source` | `source:bdu` |
| `tag` | `tag:ransomware` |
| `created` / `updated` | `updated:2024-06-01..2024-06-30` (`updated` → `localSyncedAt`) |

Пробел / `AND` = AND; `OR` и `( … )` поддерживаются парсером. SQL builder: `src/lib/search/sql-builder.ts`.

## Seed

```bash
DATABASE_URL=postgresql://vuln:vuln@localhost:5432/vuln pnpm db:seed
```

Читает `tests/fixtures/nvd-fragment.json` + `bdu-mini.xml`, линкует **CVE-2024-0001 ↔ BDU:2024-00001** с sources + history, плюс дополнительные sample rows (≥10). Создаёт placeholder bootstrap user если Auth ещё не засеял.

## Тесты

- Unit: `tests/unit/advanced-query.test.ts` (TC-020 + Query Builder).
- E2E: `tests/e2e/vulnerabilities.spec.ts` (TC-003/004 smoke).
