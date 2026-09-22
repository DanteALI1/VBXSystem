# Auth и роли

## Стек

- Better Auth (`lib/auth.ts`), email/password enabled.
- Таблицы: `users`, `session`, `account`, `verification`.
- Роль приложения: `users.role` ∈ `admin` | `analyst` | `viewer` (default `viewer`).

Wave 0: auth UI / session middleware **не подключены** (placeholder `/login`). См. [ADR-002](../decisions/ADR-002-auth.md).

## Матрица прав (контракт MVP)

| Действие | viewer | analyst | admin |
|----------|--------|---------|-------|
| Просмотр dashboard, vulns, assets, findings, scans | ✓ | ✓ | ✓ |
| CRUD assets | ✗ | ✓ | ✓ |
| CRUD allowlist | ✗ | ✓ | ✓ |
| Смена статуса finding | ✗ | ✓ | ✓ |
| Запуск scan (enqueue) | ✗ | ✓ | ✓ |
| Запуск NVD/BDU sync (enqueue) | ✗ | ✓ | ✓ |
| Управление пользователями / ролями | ✗ | ✗ | ✓ |
| Удаление критичных сущностей (policy) | ✗ | ограничено | ✓ |
| Bootstrap / смена AUTH | — | — | ops |

Viewer **не может** триггерить sync/scan — TC-002.

## Bootstrap

Первый admin: [bootstrap-admin.md](../setup/bootstrap-admin.md).

## Будущее

LDAP / OIDC — после MVP email/password (ADR-002). Не реализовывать в Wave 0.
