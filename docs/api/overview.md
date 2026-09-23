# API — overview

## Принципы

1. **Enqueue only** для долгой работы: NVD/BDU sync и **scans**. HTTP валидирует RBAC (+ allowlist для scans), кладёт job в BullMQ, отвечает `202`.
2. **Синхронно** — CRUD/чтение assets, allowlist, vulnerabilities, findings (list/detail/status), dashboard, list/detail scans.
3. **RBAC** на мутирующих endpoint (см. [auth-roles](../features/auth-roles.md)).
4. **Allowlist** проверяется до создания `scan_jobs` и повторно в worker (`runScanJob`).

Базовый URL: `APP_URL` (dev: `http://localhost:3000`). Все перечисленные пути требуют cookie-сессии Better Auth, кроме публичных handlers auth.

---

## Auth

| Method | Path | Описание |
|--------|------|----------|
| * | `/api/auth/*` | Better Auth handler (`sign-in`, `sign-out`, session, …) |

Bootstrap admin — CLI, не HTTP: `npm run bootstrap:admin`.

---

## Vulnerabilities

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/vulnerabilities` | any auth | list + filters (`q`, severity, source, page…) |
| GET | `/api/vulnerabilities/:id` | any auth | detail + `sources[]` |

---

## Assets

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/assets` | any auth | list `?q=&page=&pageSize=` |
| POST | `/api/assets` | analyst+ | create → `201` |
| GET | `/api/assets/:id` | any auth | detail + `services[]` |
| PATCH | `/api/assets/:id` | analyst+ | partial update |
| DELETE | `/api/assets/:id` | analyst+ | `204` |

Детали: [features/assets.md](../features/assets.md).

---

## Allowlist

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/allowlist` | any auth | list `?page=&pageSize=` |
| POST | `/api/allowlist` | admin | create → `201` |
| PATCH | `/api/allowlist/:id` | admin | partial update |
| DELETE | `/api/allowlist/:id` | admin | `204` |

Отдельного `GET /api/allowlist/:id` нет — item возвращается из list/create/patch.

---

## Sync

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/sync/status` | any auth | `nvd`/`bdu` SyncState + recent BullMQ jobs |
| POST | `/api/sync/nvd` | admin | enqueue `nvd-sync` → `202 { jobId }` |
| POST | `/api/sync/bdu` | admin | enqueue `bdu-sync` → `202 { jobId }` |
| POST | `/api/sync/bdu/upload` | admin | multipart `file` → `202 { jobId, uploadedPath }` |

Optional JSON body NVD/BDU: `{ mode?: "live"|"fixture", force?: boolean, days?: number }` (`days` только NVD).  
`409` если соответствующий `sync_states.status === "running"`.  
Подробности: [features/sync.md](../features/sync.md).

---

## Scans

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/scans` | any auth | list `?type=&status=&page=&pageSize=` |
| POST | `/api/scans` | analyst+ | allowlist gate → insert + enqueue → `202 { id, status }` |
| GET | `/api/scans/:id` | any auth | detail + `findingsCount` + `reportDir` |

Body POST:

```json
{ "type": "nmap", "target": "10.0.1.10", "options": { "fixture": true } }
```

- Target вне enabled allowlist → **400** (`ScanAllowlistError`), job не создаётся.
- Очередь BullMQ: `scan`, payload `{ scanJobId }`, jobId = id строки `scan_jobs`.
- App только enqueue; выполнение в `worker/processors/scan.ts` → `runScanJob`.

Подробности: [features/scans.md](../features/scans.md).

---

## Findings

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/findings` | any auth | list `?status=&q=&page=&pageSize=` |
| GET | `/api/findings/:id` | any auth | detail |
| PATCH | `/api/findings/:id` | analyst+ | body `{ "status": "…" }` с матрицей переходов |

- Viewer → **403** на PATCH.
- Недопустимый переход → **400**; переход запрещён для роли (например accepted→open у analyst) → **403**.
- Отдельного `PATCH …/status` **нет** — статус в body на `/api/findings/:id`.

Подробности: [features/findings.md](../features/findings.md).

---

## Dashboard

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/dashboard` | any auth | counters (vulns, assets, open findings) + sync snapshot |

---

## Коды ошибок (фактические)

| Code | Когда |
|------|-------|
| `401` | нет сессии |
| `403` | роль не позволяет (viewer sync/scan/finding mutate, non-admin allowlist write, …) |
| `400` | Zod validation / empty upload / allowlist reject / finding transition |
| `404` | asset / allowlist / scan / finding id не найден |
| `409` | sync уже `running` |
| `202` | job принят в очередь (sync `jobId` / scan `{ id, status }`) |
| `204` | успешный DELETE |
| `500` | необработанная ошибка (`jsonError`) |

Redis down на `GET /api/sync/status`: SyncState из БД отдаётся, блок `jobs` может быть `null` (ошибка глотается).  
Redis down на `POST /api/scans`: строка `scan_jobs` может остаться `failed` после неудачного enqueue.
