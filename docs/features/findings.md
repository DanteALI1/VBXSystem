# Findings

Маршрут: `/app/findings`

## Контракт

Таблица `findings`: связь с `asset` (обязательно), опционально `vulnerability`, `service`, `scan_job`.

- `severity` + `status` (`open` | `fixed` | `accepted` | `false_positive`)
- `cve_id` — денормализация для фильтров
- default status: `open`

## Переходы статуса (план)

Разрешённые переходы (базовая матрица):

| Из | В | Кто |
|----|---|-----|
| open | fixed, accepted, false_positive | analyst, admin |
| fixed | open | analyst, admin (реоткрытие) |
| accepted | open | admin |
| false_positive | open | admin |

TODO: уточнить workflow и аудит-лог в следующих волнах. UI Wave 0 — placeholder (TC-014).

## Список / фильтры (план)

- status, severity, asset, CVE
- связь с dashboard counters (TC-016)

## Тесты

- TC-012, TC-013 (создание из фикстур)
- TC-014 status transition
- TC-016 dashboard counters
