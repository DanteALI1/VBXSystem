# TC-015 Sync settings enqueue jobs

Status: draft  
Type: integration  
Priority: P0  
Module: sync / workers

## Preconditions

- Redis доступен.
- Analyst/admin сессия.
- API sync endpoints (план).

## Steps

1. GET sync state — строки `sync_states` для `nvd` и `bdu` (создать если нет).
2. POST `/api/sync/nvd` → ответ 202 + job id.
3. Проверить наличие job в очереди BullMQ `nvd-sync` (или запись статуса `running` после pickup).
4. POST `/api/sync/bdu` аналогично для `bdu-sync`.
5. Viewer → 403 (связь с TC-002).

## Expected

- App **не** выполняет download inline; только enqueue.
- Дублирующий enqueue во время `running` — политика: reject или coalesce (зафиксировать в реализации).
- После stub-worker без processor job остаётся waiting — допустимо до Wave sync.

## Automation

TBD: `tests/integration/sync-enqueue.test.ts`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Очереди объявлены в `worker/index.ts`.
