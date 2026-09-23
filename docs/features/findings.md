# Findings

Finding — факт обнаружения (сканер или ручная фиксация) на активе, опционально связанный с записью каталога `Vulnerability`.

## Список

Колонки: title, severity, status, asset, service (port), CVE/BDU, first/last seen, scanJob.

Фильтры: status, severity, asset, tag уязвимости, текстовый поиск.

Роли: чтение `viewer`+; смена статуса / назначение `analyst`+; удаление `admin`.

## Статусы и переходы

| Из \ В | open | confirmed | risk_accepted | fixed | false_positive |
|--------|------|-----------|---------------|-------|----------------|
| open | — | ✓ | ✓ | ✓ | ✓ |
| confirmed | ✓ | — | ✓ | ✓ | ✓ |
| risk_accepted | ✓ | ✓ | — | ✓ | ✓ |
| fixed | ✓ (регресс) | ✓ | — | — | — |
| false_positive | ✓ | ✓ | — | — | — |

При уходе в терминальные `fixed` / `false_positive` / `risk_accepted` выставляется `closedAt` (очищается при возврате в open/confirmed).

Недопустимый переход → 400 `INVALID_STATUS_TRANSITION` (TC-014).

## Деталь

- Evidence (json из сканера), сырой фрагмент.
- Связь vulnerability (deep link в каталог).
- Asset / service.
- История смены статуса (минимально — в `updatedAt` + audit TODO Wave 2).

## Создание

1. Автоматически из ingest nmap/nuclei.
2. Вручную analyst+ (title, asset, optional vulnerabilityId) — TODO Wave 1 если не в MVP.

## Дедуп

Ключ ориентира: `(assetId, serviceId?, vulnerabilityId|title fingerprint)`. Повторный скан обновляет `lastSeenAt`, не создаёт дубль open-finding.

## Dashboard

Счётчики open/critical findings — TC-016.

## API (ориентир)

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/findings` | viewer+ |
| GET | `/api/findings/:id` | viewer+ |
| PATCH | `/api/findings/:id` | analyst+ (status, notes) |
| DELETE | `/api/findings/:id` | admin |

TODO (Wave 2): bulk status, SLA, экспорт.
