# TC-006 NVD rate-limit backoff mock

Status: automated  
Type: unit  
Priority: P0  
Module: nvd-sync

## Preconditions

- HTTP client NVD с injectable fetch / sleep.
- Симуляция ответа `429` + `Retry-After`.

## Steps

1. Mock: первая попытка → 429 с Retry-After.
2. Вызвать `fetchPage`.
3. Убедиться, что клиент ждёт backoff (fake timers) и повторяет запрос.
4. Вторая попытка → 200 с валидным JSON.
5. Persistent 429 → stop after `maxRetries`.
6. No API key → pause between requests.

## Expected

- Нет необработанного throw на первом 429.
- Число retry ограничено политикой.
- С `NVD_API_KEY` и без — разные default delay, оба уважают 429.

## Automation

`tests/unit/nvd-backoff.test.ts` — mock fetch + fake timers.

## Last run

datetime: 2026-09-22 23:33 UTC  
command: `npm run test:unit`  
result: PASS  
evidence: 3 tests, exit 0

## Notes

Не ходить в реальный NVD из unit.
