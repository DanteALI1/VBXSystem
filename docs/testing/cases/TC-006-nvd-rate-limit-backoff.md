# TC-006 NVD rate-limit backoff (mock)

Status: draft  
Type: unit  
Priority: P0  
Module: workers / nvd

## Preconditions

- HTTP client NVD замокан.
- Последовательность ответов: 429, 429, 200 (или 403 rate, затем 200).

## Steps

1. Вызвать sync с mock, который дважды возвращает 429 с Retry-After (или без).
2. Убедиться, что используются exponential backoff + jitter (шпион на sleep/delay).
3. На финальном 200 — upsert выполняется.
4. Сценарий исчерпания `NVD_MAX_RETRIES` — все 429.

## Expected

- Между попытками есть увеличивающиеся задержки (проверяемые границы, не flaky exact ms).
- Job не помечает `SyncState.lastSuccessAt` при полном fail.
- При успехе после backoff — success обновлён.
- При исчерпании ретраев — `lastError` заполнен, controlled fail.

## Automation

`tests/unit/nvd-backoff.test.ts` (planned)

## Last run

—

## Notes

Тип может быть integration, если backoff живёт только в worker pipeline — тогда fake timers обязательны.
