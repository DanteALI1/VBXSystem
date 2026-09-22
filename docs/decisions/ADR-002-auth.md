# ADR-002: Auth

## Статус

Accepted (направление); реализация UI/middleware — после Wave 0 scaffold.

## Контекст

Нужны сессии и роли `admin` / `analyst` / `viewer` без внешней IdP на старте MVP.

## Решение

- **Better Auth** + Drizzle adapter (`lib/auth.ts`), email/password.
- Роль хранится в `users.role` (не отдельная RBAC-таблица в MVP).
- Bootstrap первого admin через `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

## Будущее

- **LDAP** и/или **OIDC** — отдельные providers Better Auth после стабилизации email/password и RBAC matrix.
- Не смешивать корпоративный SSO в Wave 0–1 без отдельного ADR.

## Последствия

- Зависимость от `AUTH_SECRET` и корректного `APP_URL`.
- Таблицы `session` / `account` / `verification` обязаны жить рядом с доменом.
