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

## Список (план)

Фильтры / поиск:

- текст: title, CVE, BDU
- severity
- source (через join sources)
- сортировка по severity / published_at

TODO: UI Wave 0 — placeholder; реализация фильтров — следующие волны (TC-003).

## Деталь (план)

- CVE / BDU id, title, description
- severity + CVSS
- блок источников (NVD JSON meta, BDU XML meta, external_url)
- связанные findings (если есть)

TODO: UI placeholder (TC-004).

## Синхронизация

Запуск только через enqueue (`nvd-sync` / `bdu-sync`), роли admin/analyst. Viewer — запрет (TC-002, TC-015).

## Тесты

- TC-003, TC-004, TC-005, TC-006, TC-007, TC-008
