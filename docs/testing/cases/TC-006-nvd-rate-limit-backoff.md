# TC-006 NVD rate-limit backoff (mock)

Status: automated  
Type: integration  
Priority: P0  
Module: workers / nvd

## Preconditions

- HTTP client NVD замокан (`fetch` inject).
- Последовательность ответов: 429, 429, 200; отдельный сценарий все 429.

## Steps

1. Вызвать `runNvdSync` с mock, который дважды возвращает 429 с Retry-After.
2. Убедиться, что `sleep` вызывается (Retry-After / exponential backoff + jitter).
3. На финальном 200 — upsert выполняется, `SyncState.lastSuccessAt` обновлён.
4. Сценарий исчерпания `maxRetries` — все 429 → `lastError`, `lastSuccessAt` null.

## Expected

- Между попытками есть задержки (границы / Retry-After, не flaky wall-clock).
- Job не помечает `SyncState.lastSuccessAt` при полном fail.
- При успехе после backoff — success обновлён.
- При исчерпании ретраев — `lastError` заполнен, controlled fail.

## Automation

`tests/integration/nvd-backoff.test.ts`

## Last run

—

## Notes

Sleep инжектится no-op collector — без real timers / без сети к NIST.
