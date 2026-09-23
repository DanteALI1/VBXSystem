# Уязвимости (каталог)

Каталог CVE/БДУ — центральный экран консоли. UX ориентирован на **плотную table-first** консоль (паттерны IA из ADR-004), без копирования кода или бренда OpenCVE.

## Список (List)

- Таблица: CVE, BDU, severity, CVSS 3.1, KEV, EPSS, vendor/product, sources, `localSyncedAt`, updated.
- Тулбар: простой поиск, переключатель advanced query, фильтры severity/KEV/source/tag, кнопка Saved views.
- Пагинация server-side; default page size — `VULN_PAGE_SIZE_DEFAULT`.
- Сортировка: `cvss31`, `epss`, `published`, `updated`, `localSyncedAt`.

Роли: `viewer`+ чтение; изменение тегов/views — `analyst`+; принудительный sync — `analyst`+ (enqueue), настройки источников — `admin`.

## Деталь (Detail)

Секции:

1. Заголовок: CVE / BDU идентификаторы, severity badge, KEV.
2. Описание.
3. CVSS 3.1 score + vector.
4. Vendor / product / CPE-подобные поля (если есть).
5. Источники (`VulnerabilitySource`): NVD, BDU, даты fetch.
6. Теги + редактирование (analyst+).
7. EPSS / дополнительные метрики.
8. История (`VulnerabilityHistory`) — лента изменений.
9. Связанные findings (если есть).

## Advanced search syntax

Строка вида `field:value` с логическими операторами. Лимит числа field-клауз: **`ADVANCED_SEARCH_MAX_FIELDS`** (default 20). Превышение → 400 `SEARCH_TOO_COMPLEX`.

### Поля

| Поле | Тип значения | Пример |
|------|--------------|--------|
| `cve` | id / prefix | `cve:CVE-2024-1234` |
| `bdu` | id | `bdu:BDU:2024-*****` |
| `description` | текст / фраза в кавычках | `description:"remote code"` |
| `vendor` | текст | `vendor:microsoft` |
| `product` | текст | `product:windows` |
| `cvss31` | число / диапазон | `cvss31:>=9`, `cvss31:7.0-8.9` |
| `severity` | enum | `severity:critical` |
| `kev` | bool | `kev:true` |
| `epss` | число / диапазон | `epss:>=0.5` |
| `source` | `nvd`\|`bdu`\|`manual` | `source:bdu` |
| `tag` | имя тега | `tag:ransomware` |
| `created` | дата / диапазон | `created:>=2024-01-01` |
| `updated` | дата / диапазон | `updated:2024-06-01..2024-06-30` |

### Операторы и грамматика

- Пробел между клаузами = **AND**.
- `OR` / `AND` явно; группировка `( ... )`.
- Отрицание: `-field:value` или `NOT field:value`.
- Сравнения: `:`, `:=`, `:>`, `:>=`, `:<`, `:<=`, `:..` (range).
- Даты: `YYYY-MM-DD` или ISO; relative `created:>=-30d` (TODO Wave 1 — если не успеем, оставить только абсолютные).
- Кавычки для фраз с пробелами.

Примеры:

```text
severity:critical kev:true
cve:CVE-2024 OR cve:CVE-2023 source:nvd
vendor:apache product:http cvss31:>=7
tag:internal -severity:low
updated:2024-01-01..2024-03-31
```

Парсер — unit-покрытие TC-020; UI integration TC-003.

## Saved views

- Сохранение текущих `query` + `filters` + `columns` + `sort` как `SavedView` scope=`vulnerabilities`.
- Load заменяет состояние тулбара и refetch.
- `isShared=true` — видно другим analyst/admin (feature flag).
- CRUD: владелец; admin может удалить чужой shared.

TC-018.

## Теги

- Создание тега: analyst+.
- Назначение на уязвимость: detail или bulk (bulk TODO Wave 2).
- Фильтр `tag:` и chip-фильтр в UI — TC-019.

## Sync из UI

- Кнопки «Sync NVD» / «Sync BDU» ставят job в очередь (не блокируют HTTP).
- Статус последнего sync — из `SyncState`.
- Viewer получает 403 (TC-002).

TODO (Wave 1): точные route paths и компонент таблицы.
