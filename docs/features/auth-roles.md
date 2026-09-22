# Auth и роли

## Стек

- Better Auth (`lib/auth.ts`), email/password, `disableSignUp: true`.
- Client: `lib/auth-client.ts` (`signIn` / `signOut` / `useSession`).
- Route: `app/api/auth/[...all]/route.ts`.
- Proxy: `/app/**` requires session cookie → else `/login`; `/login` redirects to `/app` when cookie present (`proxy.ts`, Next.js 16).
- Таблицы: `users`, `session`, `account`, `verification`.
- Роль: `users.role` ∈ `admin` | `analyst` | `viewer` (default `viewer`), exposed via Better Auth `user.additionalFields`.

Helpers: `lib/auth/roles.ts` — `requireRole`, `canTriggerSync`, `canManageAllowlist`, `canChangeFindingStatus`, `canCreateScan`.

## Матрица прав (контракт MVP)

| Действие | viewer | analyst | admin |
|----------|--------|---------|-------|
| Просмотр dashboard, vulns, assets, findings, scans | ✓ | ✓ | ✓ |
| CRUD assets | ✗ | ✓ | ✓ |
| CRUD allowlist (`canManageAllowlist`) | ✗ | ✗ | ✓ |
| Смена статуса finding (`canChangeFindingStatus`) | ✗ | ✓ | ✓ |
| Запуск scan (`canCreateScan`) | ✗ | ✓ | ✓ |
| Запуск NVD/BDU sync (`canTriggerSync`) | ✗ | ✗ | ✓ |
| Управление пользователями / ролями | ✗ | ✗ | ✓ |
| Bootstrap admin | — | — | ops |

Viewer **не может** триггерить sync/scan — TC-002.

## Bootstrap

`npm run bootstrap:admin` — см. [bootstrap-admin.md](../setup/bootstrap-admin.md).

## Будущее

LDAP / OIDC — после MVP email/password (ADR-002).
