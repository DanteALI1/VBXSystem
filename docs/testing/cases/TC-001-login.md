# TC-001 Login success/fail

Status: automated  
Type: e2e  
Priority: P0  
Module: auth

## Preconditions

- Приложение запущено; миграции применены.
- Существует пользователь bootstrap admin (`BOOTSTRAP_ADMIN_EMAIL` / password из test env, не прод-секреты).
- Саморегистрация отключена.

## Steps

1. Открыть `/login`.
2. Ввести неверный email или пароль → Submit.
3. Ввести валидные credentials admin → Submit.
4. Выполнить logout.
5. Открыть защищённый URL (например `/app`) без сессии.

## Expected

1. Форма логина отображается с брендом **VBX** (не OpenCVE).
2. При неверных данных — ошибка, сессия не создаётся, остаёмся на login; API auth возвращает отказ.
3. При верных — редирект на `/app`; cookie сессии установлена; виден UI роли admin.
4. После logout cookie инвалидирована.
5. Без сессии — редирект на `/login`.

## Automation

`tests/e2e/login.spec.ts` — Playwright TC-001.

Запуск (сервер должен слушать `APP_URL`, default `http://localhost:3000`):

```bash
pnpm test:e2e -- tests/e2e/login.spec.ts
```

Если сервер недоступен, спека **skip**’ает сценарии (не fail CI без стенда).

## Last run

—

## Notes

Использовать credentials из `.env` / `.env.example` (`BOOTSTRAP_ADMIN_*`). Не скринить реальные пароли.
