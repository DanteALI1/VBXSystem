# Аутентификация и роли

## Модель входа

- Провайдер: **Better Auth**, email + password (`src/lib/auth/auth.ts`).
- Сессии cookie-based; `baseURL` = `APP_URL` (fallback `BETTER_AUTH_URL`).
- Секрет: `AUTH_SECRET` (fallback `BETTER_AUTH_SECRET`).
- Саморегистрация **выключена** (`emailAndPassword.disableSignUp: true`); пользователи создаёт admin / bootstrap seed.
- API: `POST/GET /api/auth/*` (`src/app/api/auth/[...all]/route.ts`).
- Middleware (`src/middleware.ts`): `/app/**` требует cookie сессии → иначе `/login`; авторизованный на `/login` → `/app`.
- Задел: LDAP / OIDC (флаги `FEATURE_LDAP` / `FEATURE_OIDC`, см. ADR-002).

## Роли

| Роль | Назначение |
|------|------------|
| `viewer` | Только чтение каталога, активов, findings, статусов sync |
| `analyst` | Триаж findings, теги, saved views, enqueue sync/scan, CRUD assets (по политике) |
| `admin` | Всё analyst + пользователи, allowlist mutate, bootstrap-политики, опасные удаления, sync settings |

Хелперы: `src/lib/auth/rbac.ts` — `requireSession`, `requireRole`, `requireMinRole`, `PERMISSIONS`.

## Матрица доступа (сжатая)

| Действие | viewer | analyst | admin |
|----------|--------|---------|-------|
| Login / просмотр vulnerabilities | ✓ | ✓ | ✓ |
| Advanced search / saved views (свои) | ✓ read / load | ✓ CRUD свои | ✓ |
| Shared saved view create | — | ✓ | ✓ |
| Теги: создать/назначить | — | ✓ | ✓ |
| Enqueue NVD/BDU sync | — | ✓ | ✓ |
| Sync settings (cron/keys UI) | — | — | ✓ |
| Assets CRUD | read | ✓ | ✓ |
| Allowlist read | ✓ | ✓ | ✓ |
| Allowlist write | — | — | ✓ |
| Scan create | — | ✓ | ✓ |
| Finding status change | — | ✓ | ✓ |
| User management | — | — | ✓ |
| Bootstrap disable flag | — | — | ops |

Точные HTTP-коды: неавторизован `401`, запрещено `403` (TC-001, TC-002).

## UI

- `/login` — плотная консольная форма (бренд **VBX**).
- Недоступные действия скрыты или disabled с tooltip.
- Сервер — источник истины: UI-скрытие не заменяет RBAC.

## Создание пользователей

Admin UI (TODO): email, name, role, temporary password / invite.

Пока нет UI — bootstrap admin через `pnpm db:seed` (см. [bootstrap-admin](../setup/bootstrap-admin.md)).

## Сессии

- Logout через Better Auth `signOut` инвалидирует сессию.
- Cookie session: 7 дней (`expiresIn`), cookie cache 5 мин.
- HTTPS обязателен в production за reverse proxy.

См. [ADR-002](../decisions/ADR-002-auth.md), [TC-001](../testing/cases/TC-001-login.md), [TC-002](../testing/cases/TC-002-viewer-cannot-sync.md).
