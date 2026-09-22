# API — overview

## Принципы

1. **Enqueue only** для долгой работы (NVD/BDU sync; сканы — Wave 3). HTTP валидирует RBAC, при необходимости проверяет `sync_states.status`, кладёт job в BullMQ, отвечает `202` + `jobId`.
2. **Синхронно** — CRUD/чтение assets, allowlist, vulnerabilities, dashboard.
3. **RBAC** на мутирующих endpoint (см. [auth-roles](../features/auth-roles.md)).
4. **Allowlist** будет проверяться до создания `scan_jobs` (Wave 3); CRUD allowlist уже реализован.

Базовый URL: `APP_URL` (dev: `http://localhost:3000`). Все перечисленные пути требуют cookie-сессии Better Auth, кроме публичных handlers auth.

---

## Реализованные endpoints (Wave 2)

### Auth

| Method | Path | Описание |
|--------|------|----------|
| * | `/api/auth/*` | Better Auth handler (`sign-in`, `sign-out`, session, …) |

Bootstrap admin — CLI, не HTTP: `npm run bootstrap:admin`.

### Vulnerabilities

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/vulnerabilities` | any auth | list + filters (`q`, severity, source, page…) |
| GET | `/api/vulnerabilities/:id` | any auth | detail + `sources[]` |

### Assets

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/assets` | any auth | list `?q=&page=&pageSize=` |
| POST | `/api/assets` | analyst+ | create → `201` |
| GET | `/api/assets/:id` | any auth | detail + `services[]` |
| PATCH | `/api/assets/:id` | analyst+ | partial update |
| DELETE | `/api/assets/:id` | analyst+ | `204` |

Детали: [features/assets.md](../features/assets.md).

### Allowlist

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/allowlist` | any auth | list `?page=&pageSize=` |
| POST | `/api/allowlist` | admin | create → `201` |
| PATCH | `/api/allowlist/:id` | admin | partial update |
| DELETE | `/api/allowlist/:id` | admin | `204` |

Отдельного `GET /api/allowlist/:id` нет — item возвращается из list/create/patch.

### Sync

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/sync/status` | any auth | `nvd`/`bdu` SyncState + recent BullMQ jobs |
| POST | `/api/sync/nvd` | admin | enqueue `nvd-sync` → `202 { jobId }` |
| POST | `/api/sync/bdu` | admin | enqueue `bdu-sync` → `202 { jobId }` |
| POST | `/api/sync/bdu/upload` | admin | multipart `file` → `202 { jobId, uploadedPath }` |

Optional JSON body NVD/BDU: `{ mode?: "live"|"fixture", force?: boolean, days?: number }` (`days` только NVD).  
`409` если соответствующий `sync_states.status === "running"`.  
Подробности: [features/sync.md](../features/sync.md).

### Dashboard

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/dashboard` | any auth | counters (vulns, assets, open findings) + sync snapshot |

---

## Планируемые (ещё нет route)

| Method | Path | Волна | Примечание |
|--------|------|-------|-----------|
| GET | `/api/findings` | 3 | list |
| PATCH | `/api/findings/:id/status` | 3 | analyst+ |
| GET/POST | `/api/scans` | 3 | POST enqueue + allowlist gate |
| GET | `/api/scans/:id` | 3 | detail |

UI pages `/app/findings`, `/app/scans` могут существовать как shell — HTTP API появится с адаптерами.

---

## Коды ошибок (фактические)

| Code | Когда |
|------|-------|
| `401` | нет сессии |
| `403` | роль не позволяет (viewer sync, non-admin allowlist write, …) |
| `400` | Zod validation / empty upload / missing `file` |
| `404` | asset/allowlist id не найден |
| `409` | sync уже `running` |
| `202` | job принят в очередь |
| `204` | успешный DELETE |
| `500` | необработанная ошибка (`jsonError`) |

Redis down на `GET /api/sync/status`: SyncState из БД отдаётся, блок `jobs` может быть `null` (ошибка глотается).
