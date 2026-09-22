# TC-006 NVD rate-limit backoff mock

Status: draft  
Type: unit  
Priority: P0  
Module: nvd-sync

## Preconditions

- HTTP client NVD обёрнут с injectable fetch/mock.
- Симуляция ответа `429` + `Retry-After`.

## Steps

1. Mock: первая попытка → 429 с Retry-After.
2. Вызвать sync/fetch batch.
3. Убедиться, что клиент ждёт backoff (fake timers) и повторяет запрос.
4. Вторая попытка → 200 с валидным JSON.

## Expected

- Нет необработанного throw на первом 429.
- Число retry ограничено политикой (не бесконечный цикл).
- С `NVD_API_KEY` и без — разные default delay допустимы, оба уважают 429.

## Automation

TBD: `tests/unit/nvd-client-backoff.test.ts`. Пока нет.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Не ходить в реальный NVD из unit.
