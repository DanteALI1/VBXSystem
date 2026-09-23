# Аутентификация и роли

## Модель входа

- Провайдер: **Better Auth**, email + password.
- Сессии cookie-based на `BETTER_AUTH_URL`.
- Саморегистрация **выключена**; пользователи создаёт admin (или bootstrap).
- Задел: LDAP / OIDC (флаги `FEATURE_LDAP` / `FEATURE_OIDC`, см. ADR-002).

## Роли

| Роль | Назначение |
|------|------------|
| `viewer` | Только чтение каталога, активов, findings, статусов sync |
| `analyst` | Триаж findings, теги, saved views, enqueue sync/scan, CRUD assets (по политике) |
| `admin` | Всё analyst + пользователи, allowlist mutate, bootstrap-политики, опасные удаления, sync settings |

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

- Недоступные действия скрыты или disabled с tooltip.
- Сервер — источник истины: UI-скрытие не заменяет RBAC.

## Создание пользователей

Admin UI (TODO Wave 1): email, name, role, temporary password / invite.

Пока нет UI — скрипт `pnpm user:create` (TODO) или прямой bootstrap только для admin.

## Сессии

- Logout инвалидирует сессию.
- Idle timeout — настройки Better Auth (зафиксировать в коде).
- HTTPS обязателен в production за reverse proxy.

См. [ADR-002](../decisions/ADR-002-auth.md), [TC-001](../testing/cases/TC-001-login.md), [TC-002](../testing/cases/TC-002-viewer-cannot-sync.md).
