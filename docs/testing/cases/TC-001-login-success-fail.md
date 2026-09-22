# TC-001 Login success/fail

Status: draft  
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

## Expected

- Невалидный логин: HTTP/UI error, доступ к `/app` запрещён.
- Валидный логин: роль читается из `users.role`, UI доступен.
- Повторный заход на `/login` при активной сессии — редирект (когда middleware готов).

## Automation

`tests/e2e/` — путь TBD (`login.spec.ts`), пока **manual**/skeleton.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Wave 0: `/login` placeholder — кейс не исполнять до wiring Better Auth.
