# Bootstrap первого администратора

Первый пользователь с ролью `admin` создаётся **только** скриптом seed из переменных окружения. Саморегистрация в UI отключена (on-prem).

## Когда запускать

- Чистая БД после `pnpm db:migrate`.
- Повторный запуск идемпотентен: если admin уже есть — no-op (exit 0).
- Если email из env уже существует с **другой** ролью — exit 2 (не повышает автоматически).

## Подготовка

В `.env` (см. `.env.example`):

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@local.dev
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123!
BOOTSTRAP_ADMIN_NAME=Administrator
# BOOTSTRAP_ADMIN_DISABLED=false
```

Требования к паролю: минимум **12** символов (совпадает с Better Auth `minPasswordLength`).

Логин после seed: email/password из `BOOTSTRAP_ADMIN_*` (не хардкодить секреты вне `.env.example`).

## Запуск

```bash
pnpm db:seed
# alias:
pnpm bootstrap:admin
```

Скрипт: `scripts/db-seed.ts`.

Ожидаемый вывод:

```text
[bootstrap] admin upserted: admin@local.dev role=admin
```

или при повторном запуске:

```text
[bootstrap] admin already exists (admin@local.dev) — no-op
```

Коды выхода:

| Code | Смысл |
|------|--------|
| 0 | Успех или no-op (`BOOTSTRAP_ADMIN_DISABLED=true` / admin уже есть) |
| 1 | Нет обязательных env / короткий пароль / ошибка БД |
| 2 | Пользователь существует с другой ролью — не трогаем |

## Безопасность

1. Сразу смените пароль после первого входа (UI профиля — TODO; или controlled bootstrap с новым паролем на пустой БД).
2. Удалите `BOOTSTRAP_ADMIN_PASSWORD` из `.env` на постоянных стендах.
3. Установите `BOOTSTRAP_ADMIN_DISABLED=true` в production compose/k8s.
4. Не публикуйте email/пароль в скриншотах walkthrough — использовать маски.

## Проверка

1. Открыть `/login`.
2. Войти под `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
3. Убедиться, что редирект на `/app` и роль `admin` видна в шапке.
4. Создать второго пользователя с ролью `viewer` (когда UI/скрипт появится) и проверить отказ на sync (TC-002).

## Связь с Better Auth

Скрипт хеширует пароль через `hashPassword` из `better-auth/crypto` и пишет строки в `user` + `account` (`providerId=credential`) — тот же pipeline, что у Better Auth sign-up. Публичный `/sign-up/email` остаётся выключен (`disableSignUp: true`).

Детали: [ADR-002](../decisions/ADR-002-auth.md), [auth-roles](../features/auth-roles.md).
