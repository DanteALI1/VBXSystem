# ADR-002: Аутентификация

- **Status:** Accepted
- **Date:** 2026-03-23
- **Wave:** 0

## Context

On-prem консоль с ролями viewer/analyst/admin. Нужна простая email/password модель без публичной регистрации; в будущем — корпоративный SSO.

## Decision

1. **Better Auth** как библиотека сессий и password auth.
2. Провайдер **email/password** only в Wave 0–1.
3. Создание пользователей: bootstrap admin + admin UI/скрипты.
4. Роль хранится в доменной таблице `User.role` (или app User, связанный с Better Auth user id).
5. **Задел LDAP/OIDC:** env + feature flags, без реализации провайдеров до отдельной волны.

## Consequences

- Быстрый старт без IdP.
- Смена `BETTER_AUTH_SECRET` разлогинивает всех.
- LDAP/OIDC потребуют маппинг групп → ролей (отдельный ADR).

## Alternatives considered

- NextAuth / Auth.js — возможен; Better Auth уже в зависимостях.
- Только SSO сразу — блокирует lab без IdP.
- Встроить OpenCVE auth — не применимо (не форк).

## Security notes

- Пароли только через hashing pipeline Better Auth.
- `BOOTSTRAP_ADMIN_DISABLED=true` в production после выдачи доступа.
- HTTPS за reverse proxy обязателен.
