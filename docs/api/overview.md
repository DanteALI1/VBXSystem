# API Overview

HTTP API VBX — Route Handlers Next.js (`/api/...`). JSON, UTF-8. Аутентификация — сессионная cookie Better Auth (те же credentials, что UI). Для автоматизации допускается session cookie после login.

## Конвенции

| Элемент | Правило |
|---------|---------|
| Base | `/api` |
| Auth | Session required unless noted |
| Errors | `{ "error": { "code": string, "message": string, "details?": unknown } }` |
| Pagination | `?cursor=` или `?page=&pageSize=` |
| Даты | ISO-8601 UTC |
| RBAC | 401 unauthenticated, 403 forbidden |

## Группы эндпоинтов (контракт Wave 0)

### Auth

| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/auth/*` | Better Auth handler (sign-in, sign-out, session) |

### Vulnerabilities

| Method | Path | Роль | Описание |
|--------|------|------|----------|
| GET | `/api/vulnerabilities` | viewer+ | Список + filters + `q` advanced |
| GET | `/api/vulnerabilities/:id` | viewer+ | Деталь |
| POST | `/api/vulnerabilities/:id/tags` | analyst+ | Назначить тег |
| DELETE | `/api/vulnerabilities/:id/tags/:tagId` | analyst+ | Снять тег |

Query params list: `q`, `severity`, `kev`, `source`, `tag`, `sort`, `pageSize` ≤ `VULN_PAGE_SIZE_MAX`.

### Saved views

| Method | Path | Роль |
|--------|------|------|
| GET/POST | `/api/saved-views` | viewer+ / analyst+ |
| PATCH/DELETE | `/api/saved-views/:id` | owner или admin |

### Assets & services

См. [features/assets.md](../features/assets.md).

### Allowlist

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/allowlist` | viewer+ |
| POST/PATCH/DELETE | `/api/allowlist` `/api/allowlist/:id` | admin |

### Scans

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/scans` | viewer+ |
| POST | `/api/scans` | analyst+ |
| GET | `/api/scans/:id` | viewer+ |
| POST | `/api/scans/:id/cancel` | analyst+ |

POST проверяет allowlist до enqueue.

### Findings

См. [features/findings.md](../features/findings.md).

### Sync

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/settings/sync` | viewer+ | SyncState snapshot |
| POST | `/api/settings/sync/nvd` | analyst+ | enqueue → **202** `{ jobId }` |
| POST | `/api/settings/sync/bdu` | analyst+ | enqueue BDU download |
| POST | `/api/settings/sync/bdu/upload` | admin | multipart XML fallback |

Viewer → 403 на POST sync (TC-002). HTTP enqueue never blocks on full sync.

### Dashboard

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/dashboard/summary` | viewer+ | counters |

### Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | public | app up |
| GET | `/api/health/ready` | public | db+redis |

## Версионирование

Пока без `/v1` prefix. Ломающие изменения — через ADR и major product version.

## Идемпотентность

Sync upsert идемпотентен на уровне домена. POST scans не идемпотентен (каждый вызов — новый job); клиент может передать `Idempotency-Key` (TODO Wave 2).

TODO (Wave 1): OpenAPI spec (`docs/api/openapi.yaml`).
