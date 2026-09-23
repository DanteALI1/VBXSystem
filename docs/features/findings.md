# Findings

Маршрут UI: `/app/findings`  
API: `GET /api/findings`, `GET|PATCH /api/findings/:id`  
Код: `lib/findings/`, `components/findings/`

## Контракт

Таблица `findings`:

| Поле | Описание |
|------|----------|
| `asset_id` | обязательный FK |
| `service_id` | опционально (nmap port) |
| `scan_job_id` | опционально |
| `vulnerability_id` | опционально (каталог); при list/detail также резолв по `cve_id` |
| `severity` | enum severity |
| `status` | `open` \| `fixed` \| `accepted` \| `false_positive` |
| `cve_id` | денормализация для фильтров / корреляции |
| `title`, `description` | текст |
| default `status` | `open` (при persist из скана) |

Источник создания в MVP: парсеры сканеров (`persistFindingDrafts`). Ручного POST finding нет.

## API

### `GET /api/findings?status=&q=&page=&pageSize=`

Auth: любая роль с сессией.

| Param | Поведение |
|-------|-----------|
| `status` | фильтр enum; неизвестное значение **игнорируется** |
| `q` | ILIKE по title / cveId / description / asset hostname\|ip |
| `page` | default `1` |
| `pageSize` | default `25`, max `100` |

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Open port 443/tcp (https nginx 1.24.0)",
      "description": "Nmap discovered an open tcp port 443.",
      "severity": "info",
      "status": "open",
      "cveId": "CVE-2021-44228",
      "vulnerabilityId": "uuid-or-null",
      "asset": { "id": "uuid", "hostname": "web-01.lab.local", "ip": "10.0.1.10" },
      "scanJob": { "id": "uuid", "type": "nmap", "status": "succeeded" },
      "createdAt": "ISO",
      "updatedAt": "ISO"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25
}
```

- `vulnerabilityId` — FK `findings.vulnerability_id`, иначе резолв по совпадению `cveId` (UPPER) с каталогом `vulnerabilities`.
- `scanJob` — `null`, если нет связи.
- Join с `assets` обязателен (orphan findings без asset в list не попадут).

### `GET /api/findings/:id`

Тот же shape, что элемент списка. **404** если нет.

### `PATCH /api/findings/:id`

Body: `{ "status": "open" | "fixed" | "accepted" | "false_positive" }`

Путь **без** суффикса `/status` — статус в JSON body.

| Code | Когда |
|------|-------|
| **403** | viewer / роль не analyst\|admin (`requireApiRole`); либо переход запрещён для роли (`AuthError` из transitions) |
| **400** | Zod validation / недопустимый переход (`FindingTransitionError`, в т.ч. already same status) |
| **404** | id не найден |
| **200** | обновлённый finding (полный list shape) |

## Переходы статуса

Реализация: `lib/findings/transitions.ts` (`assertFindingStatusTransition`, `allowedFindingStatuses` для UI).

| Из | В | Кто |
|----|---|-----|
| open | fixed, accepted, false_positive | analyst, admin |
| fixed | open | analyst, admin (реоткрытие) |
| accepted | open | **admin only** |
| false_positive | open | **admin only** |

Переход в тот же статус → **400** `Finding is already "…"`.  
Несуществующая пара from→to → **400** `Transition from "…" to "…" is not allowed`.  
Роль не в списке для перехода → **403**.

UI: `FindingStatusSelect` — select для analyst/admin с опциями из `allowedFindingStatuses`; viewer — read-only текст.

## UI

- Таблица: severity, title, asset, cveId (ссылка на vuln при `vulnerabilityId`), status, scanJob type/status.
- Фильтры: status + поиск `q` (query string).
- Dense internal tool (как Assets / Vulnerabilities).
- RBAC create/change: `canChangeFindingStatus`.

## Dashboard

Счётчик `findingsOpen` на `GET /api/dashboard` — findings со `status=open` (TC-016).

## Тесты

| TC | Где |
|----|-----|
| TC-012 / TC-013 | создание из nmap/nuclei fixtures |
| TC-014 | `tests/integration/findings-status.test.ts` |
| TC-016 | dashboard counters (open findings) |

См. также [scans.md](scans.md), [auth-roles.md](auth-roles.md).
