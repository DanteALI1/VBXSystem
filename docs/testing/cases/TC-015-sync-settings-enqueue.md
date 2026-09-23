# TC-015 Sync settings enqueue jobs

Status: draft  
Type: integration  
Priority: P1  
Module: sync

## Preconditions

- Admin для settings; analyst для enqueue.
- Redis доступен или queue mock.

## Steps

1. Admin PATCH `/api/sync/settings` (например, включает флаг/cron representation — по контракту Wave 2).
2. Analyst POST `/api/sync/nvd` и POST `/api/sync/bdu`.
3. Проверить наличие jobs в `sync:nvd` и `sync:bdu` с корректным envelope (`requestedByUserId`).
4. Viewer POST → 403 (регресс TC-002).
5. GET `/api/sync/state` отражает lastAttempt после обработки (или queued state visible).

## Expected

- Settings меняют только admin.
- Enqueue создаёт jobs без блокировки HTTP на полный sync.
- Payload mode/cursor передаётся ожидаемо.
- Аудит/логи содержат initiator.

## Automation

`tests/integration/sync-enqueue.test.ts` (planned)

## Last run

—

## Notes

Точная форма settings API — TODO Wave 2; кейс обновить при фиксации schema.
