# Bootstrap admin

## Назначение

Создать первого пользователя с ролью `admin` при пустой БД, используя переменные:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Значения — только из [`.env.example`](../../.env.example) / локального `.env`.

## Ожидаемый flow (контракт)

1. При старте app **или** отдельной CLI-команде (TODO: реализация Wave 1+):
   - если пользователь с `BOOTSTRAP_ADMIN_EMAIL` уже есть → no-op;
   - иначе создать `users` с `role=admin` + credential account (Better Auth email/password).
2. Пароль хранится только в hash через Better Auth (`account.password`), не в plaintext в БД приложения.
3. После успеха: вход на `/login` с этими credentials.

## Текущий статус (Wave 0)

- Переменные объявлены в `.env.example`.
- Скрипт/хук bootstrap **ещё не реализован** (TODO).
- Auth UI — placeholder; Better Auth каркас в [`lib/auth.ts`](../../lib/auth.ts).

## Ручной fallback (пока нет автоматики)

TODO после появления API создания пользователя / drizzle seed:

```bash
# псевдокод — не выполнять как готовый скрипт
# npm run db:seed-admin
```

До реализации: создать admin через будущий seed или временный SQL **только в dev**, с последующей ротацией пароля.

## Безопасность

- Не коммитить реальные пароли.
- Сменить `BOOTSTRAP_ADMIN_PASSWORD` и `AUTH_SECRET` вне localhost.
- Bootstrap не должен перезаписывать существующего пользователя и не должен работать в prod без явного флага (TODO: `BOOTSTRAP_ADMIN_ENABLED`).
