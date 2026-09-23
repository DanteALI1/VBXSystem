# TC-002 Viewer cannot trigger sync

Status: draft  
Type: integration  
Priority: P0  
Module: auth / sync

## Preconditions

- Пользователи: `viewer@example.local` (role=viewer), `analyst@example.local` (role=analyst).
- Redis/BullMQ доступны (или mock queue в integration).

## Steps

1. Аутентифицироваться как viewer.
2. `POST /api/sync/nvd` и `POST /api/sync/bdu`.
3. Попытка enqueue через UI (если кнопки видны) — клик Sync.
4. Аутентифицироваться как analyst.
5. `POST /api/sync/nvd`.

## Expected

1–3. Для viewer: HTTP **403** с кодом запрета; в очередях `sync:nvd` / `sync:bdu` **нет** новых jobs от viewer; `SyncState` не меняет `lastAttemptAt` из-за этого запроса.
4–5. Analyst получает 202/200 accepted; job появляется в очереди (или фиксируется в outbox теста).

## Automation

`tests/integration/rbac-sync.test.ts` (planned); опционально e2e UI.

## Last run

—

## Notes

Критичный security-кейс: UI-скрытие недостаточно — серверный RBAC обязателен.
