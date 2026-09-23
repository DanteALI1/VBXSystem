# Bootstrap первого администратора

Первый пользователь с ролью `admin` создаётся **только** скриптом bootstrap из переменных окружения. Саморегистрация в UI отключена (on-prem).

## Когда запускать

- Чистая БД после migrate/seed.
- Восстановление доступа, если не осталось admin (создаёт или обновляет по email — поведение зафиксировать в коде Wave 1).

## Подготовка

В `.env`:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@example.local
BOOTSTRAP_ADMIN_PASSWORD=change-me-now
BOOTSTRAP_ADMIN_NAME=Administrator
# BOOTSTRAP_ADMIN_DISABLED=false
```

Требования к паролю (контракт): минимум 12 символов; в production — сложность по политике организации.

## Запуск

```bash
pnpm bootstrap:admin
```

Ожидаемый вывод (ориентир):

```text
[bootstrap] admin upserted: admin@example.local role=admin
```

Коды выхода:

| Code | Смысл |
|------|--------|
| 0 | Успех или no-op при `BOOTSTRAP_ADMIN_DISABLED=true` |
| 1 | Нет обязательных env / ошибка БД |
| 2 | Пользователь существует с другой ролью и политика «не трогать» (если включена) |

## Безопасность

1. Сразу смените пароль после первого входа (UI: профиль — TODO Wave 1, или повторный bootstrap с новым паролем в controlled change window).
2. Удалите `BOOTSTRAP_ADMIN_PASSWORD` из `.env` на постоянных стендах.
3. Установите `BOOTSTRAP_ADMIN_DISABLED=true` в production compose/k8s.
4. Не публикуйте email/пароль в скриншотах walkthrough — использовать маски.

## Проверка

1. Открыть `/login`.
2. Войти под bootstrap email/password.
3. Убедиться, что доступны пункты Sync / Allowlist / Users (admin-only).
4. Создать второго пользователя с ролью `viewer` и проверить отказ на sync (TC-002).

## Связь с Better Auth

Скрипт использует тот же password hashing pipeline, что и Better Auth (не писать пароль в БД plaintext). Детали: [ADR-002](../decisions/ADR-002-auth.md).

TODO (Wave 1): точный путь скрипта `scripts/bootstrap-admin.ts`, идемпотентность upsert vs fail-if-exists.
