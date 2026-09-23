# TC-016 Dashboard counters

Status: automated — PASS  
Type: integration|e2e  
Priority: P1  
Module: dashboard

## Preconditions

- Seed / DB с vulnerabilities, assets, findings.
- Пользователь авторизован (mock session для API; storageState для UI).

## Steps

1. Unauthenticated `GET /api/dashboard` → 401.
2. Authenticated GET — counters: `vulnerabilities`, `assets`, `findingsOpen`, sync states.
3. Сверить с SQL `count()` / `findings where status=open`.
4. Создать open finding → `findingsOpen` +1; open→fixed → обратно.
5. UI `/app`: counter cards показывают те же числа, что API.

## Expected

- Числа совпадают с SQL-агрегатами.
- Нет hardcoded значений.
- Пустая БД — нули, не ошибка.

## Automation

- Integration: `tests/integration/dashboard-counters.test.ts`
- E2E UI: `tests/e2e/dashboard-counters.spec.ts`

```bash
npm run test:integration -- tests/integration/dashboard-counters.test.ts
npm run test:e2e -- tests/e2e/dashboard-counters.spec.ts
```

## Last run

datetime: 2026-09-23 00:08 UTC  
command: `npm run test:integration` + `npm run test:e2e`  
result: PASS  
evidence: API↔SQL; UI cards match `/api/dashboard`

## Notes

API: `GET /api/dashboard` → [`app/api/dashboard/route.ts`](../../../app/api/dashboard/route.ts).
