# TC-015 Sync settings enqueue jobs

Status: automated — PASS  
Type: integration  
Priority: P0  
Module: sync / workers

## Preconditions

- Redis доступен.
- Mock admin session.
- API: `GET /api/sync/status`, `POST /api/sync/nvd`, `POST /api/sync/bdu`.

## Steps

1. GET sync status — `nvd` и `bdu` states (ensure created).
2. POST `/api/sync/nvd` `{ mode: "fixture" }` → 202 + job id; job in BullMQ `nvd-sync`.
3. POST `/api/sync/bdu` аналогично → `bdu-sync`.
4. While `ensureSyncState` reports `running` → 409.
5. Viewer → 403 (TC-002).

## Expected

- App **не** выполняет download inline; только enqueue.
- Дублирующий enqueue во время `running` → **409**.
- Job может быть waiting/active/completed если worker жив — наличие job по id достаточно.

## Automation

`tests/integration/sync-enqueue.test.ts`

## Last run

datetime: 2026-09-23 00:08 UTC (Wave 3 refresh; originally Wave 2)  
command: `npm run test:integration`  
result: PASS  
evidence: 9 tests (TC-015 + TC-002), exit 0

## Notes

Очереди: `worker/index.ts` / `lib/sync/types.ts`.  
Enqueue требует **admin** (`canTriggerSync`).
