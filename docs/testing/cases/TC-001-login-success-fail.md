# TC-001 Login success/fail

Status: automated — PASS  
Type: e2e  
Priority: P0  
Module: auth

## Preconditions

- Приложение запущено (`APP_URL`).
- Существует пользователь admin (bootstrap) с известным паролем из локального `.env` (не коммитить).
- Auth UI и Better Auth handler подключены (после Wave 0).

## Steps

1. Открыть `/login`.
2. Ввести неверный email/password → Submit.
3. Убедиться, что сессия не создана, показана ошибка.
4. Ввести валидные credentials bootstrap admin → Submit.
5. Убедиться в редиректе на `/app` (или dashboard) и наличии session cookie.
6. (optional) Unauthenticated `GET /app` → redirect `/login`.

## Expected

- Невалидный логин: HTTP/UI error, доступ к `/app` запрещён.
- Валидный логин: роль читается из `users.role`, UI доступен.
- Повторный заход на `/login` при активной сессии — редирект (когда middleware готов).

## Automation

`tests/e2e/login.spec.ts` (project `chromium-auth`)  
Helper: `tests/helpers/auth.ts`  
Setup (shared session for other specs): `tests/e2e/auth.setup.ts`

## Last run

datetime: 2026-09-22 23:16 UTC  
command: `npm run test:e2e`  
result: PASS (3/3)  
evidence: Playwright list reporter; HTML `playwright-report/`; suite exit 0

## Notes

- Better Auth production rate-limit on `/sign-in` is 3 req / 10s (`next start`). Auth setup + TC-001 stay within budget; helper retries on 429.
- Selectors: `data-testid=login-*` on `components/auth/login-form.tsx`.
