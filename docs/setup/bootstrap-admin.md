# Bootstrap admin

## Назначение

Создать первого пользователя с ролью `admin` при пустой БД:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD` (минимум 8 символов)

Значения — из [`.env.example`](../../.env.example) / локального `.env`.

## Запуск

После migrate:

```bash
npm run bootstrap:admin
```

Реализация: `lib/auth/bootstrap.ts` (вызывается из `scripts/bootstrap-admin.ts`).

## Поведение

1. Нет email/password в env → skip (exit 1).
2. Пользователь с этим email уже есть → no-op (`exists`).
3. Иначе: Better Auth `hashPassword` + `internalAdapter.createUser` / `linkAccount` с `role=admin`.
4. Идемпотентно; не перезаписывает существующего пользователя.

После успеха: вход на `/login` с этими credentials → `/app`.

## Безопасность

- Не коммитить реальные пароли.
- Сменить `BOOTSTRAP_ADMIN_PASSWORD` и `AUTH_SECRET` вне localhost.
- Public sign-up отключён (`emailAndPassword.disableSignUp`).
