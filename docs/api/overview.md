# API — overview

## Принципы

1. **Enqueue only** для долгой работы (NVD/BDU sync, сканы). HTTP-хендлер валидирует, пишет статус в БД при необходимости, кладёт job в BullMQ, отвечает быстро (`202` + id).
2. **Синхронно** — только лёгкий CRUD/чтение и смена статусов findings.
3. **RBAC** на каждом мутирующем endpoint (см. [auth-roles](../features/auth-roles.md)).
4. **Allowlist** проверяется до создания `scan_jobs` / постановки в очередь `scan`.

Wave 0: маршруты API ещё не реализованы — ниже план контракта.

## Планируемые endpoints

### Auth

| Method | Path | Описание |
|--------|------|----------|
| * | `/api/auth/*` | Better Auth handler |
| POST | (bootstrap) | TODO: одноразовый seed admin |

### Vulnerabilities

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/vulnerabilities` | all | list + filters |
| GET | `/api/vulnerabilities/:id` | all | detail + sources |

### Assets

| Method | Path | Роли |
|--------|------|------|
| GET/POST | `/api/assets` | read all; write analyst+ |
| GET/PATCH/DELETE | `/api/assets/:id` | по матрице |

### Findings

| Method | Path | Роли |
|--------|------|------|
| GET | `/api/findings` | all |
| PATCH | `/api/findings/:id/status` | analyst+ |

### Scans

| Method | Path | Роли | Примечание |
|--------|------|------|------------|
| GET | `/api/scans` | all | |
| POST | `/api/scans` | analyst+ | enqueue `scan`; allowlist gate |
| GET | `/api/scans/:id` | all | |

### Sync / settings

| Method | Path | Роли | Примечание |
|--------|------|------|------------|
| GET | `/api/sync/state` | all | `sync_states` |
| POST | `/api/sync/nvd` | analyst+ | enqueue `nvd-sync` |
| POST | `/api/sync/bdu` | analyst+ | enqueue `bdu-sync` |
| POST | `/api/sync/bdu/upload` | admin | fallback XML |
| CRUD | `/api/allowlist` | analyst+ write | |

### Dashboard

| Method | Path | Роли |
|--------|------|------|
| GET | `/api/dashboard/counters` | all | open findings by severity и т.п. |

## Ошибки (план)

- `401` / `403` — auth/RBAC
- `400` — валидация / target вне allowlist
- `409` — конфликт уникальности (редко на API, чаще внутри worker upsert)
- `202` — job принят
