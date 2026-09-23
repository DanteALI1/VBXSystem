# Auth и роли

## Стек

- Better Auth (`lib/auth.ts`), email/password, `disableSignUp: true`.
- Client: `lib/auth-client.ts` (`signIn` / `signOut` / `useSession`).
- Route: `app/api/auth/[...all]/route.ts`.
- Proxy: `/app/**` requires session cookie → else `/login`; `/login` redirects to `/app` when cookie present (`proxy.ts`, Next.js 16).
- Таблицы: `users`, `session`, `account`, `verification`.
- Роль: `users.role` ∈ `admin` | `analyst` | `viewer` (default `viewer`), exposed via Better Auth `user.additionalFields`.

Helpers (`lib/auth/roles.ts`):

| Helper | Кто проходит |
|--------|--------------|
| `canTriggerSync` | **admin** |
| `canManageAllowlist` | **admin** |
| `canManageAssets` | **analyst**, **admin** |
| `canChangeFindingStatus` | **analyst**, **admin** |
| `canCreateScan` | **analyst**, **admin** |
| `isViewer` | viewer |

API-обёртки: `requireApiSession` / `requireApiRole` / `jsonError` (`lib/api/http.ts`).

---

## Матрица прав (контракт MVP, Wave 3)

| Действие | viewer | analyst | admin | Где enforced |
|----------|--------|---------|-------|--------------|
| Просмотр dashboard, vulns, assets, findings/scans pages | ✓ | ✓ | ✓ | session на `/app/**` + GET API |
| `GET /api/sync/status` | ✓ | ✓ | ✓ | session only |
| `POST /api/sync/nvd\|bdu\|bdu/upload` | ✗ | ✗ | ✓ | `canTriggerSync` |
| `GET /api/assets`, `GET /api/assets/:id` | ✓ | ✓ | ✓ | session |
| `POST/PATCH/DELETE /api/assets` | ✗ | ✓ | ✓ | `requireApiRole` analyst+ |
| `GET /api/allowlist` | ✓ | ✓ | ✓ | session |
| `POST/PATCH/DELETE /api/allowlist` | ✗ | ✗ | ✓ | admin only |
| `GET /api/findings`, `GET /api/findings/:id` | ✓ | ✓ | ✓ | session |
| `PATCH /api/findings/:id` (status) | ✗ | ✓* | ✓ | `canChangeFindingStatus` + матрица переходов (*accepted/FP → open только admin) |
| `GET /api/scans`, `GET /api/scans/:id` | ✓ | ✓ | ✓ | session |
| `POST /api/scans` | ✗ | ✓ | ✓ | `canCreateScan` + allowlist |
| Bootstrap / управление ролями | — | — | ops / admin | `bootstrap:admin` |

Viewer **не может** триггерить sync — [TC-002](../testing/cases/TC-002-viewer-cannot-trigger-sync.md).

Замечание по sync routes: хендлер сначала вызывает `requireRole(..., ["admin","analyst","viewer"])` (любая роль из сессии), затем отдельно `canTriggerSync` → 403 для non-admin. Это намеренно: единый путь AuthError vs Forbidden.

---

## Bootstrap

`npm run bootstrap:admin` — см. [bootstrap-admin.md](../setup/bootstrap-admin.md).

Переменные: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `AUTH_SECRET`, `APP_URL`.

---

## Связанные фичи

- [Sync](sync.md) — NVD/BDU enqueue
- [Assets / allowlist](assets.md) — CRUD
- [Scans](scans.md) — enqueue + allowlist
- [Findings](findings.md) — статусы
- [API overview](../api/overview.md)

## Будущее

LDAP / OIDC — после MVP email/password ([ADR-002](../decisions/ADR-002-auth.md)).
