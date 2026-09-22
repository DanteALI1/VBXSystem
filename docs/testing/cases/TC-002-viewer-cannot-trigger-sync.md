# TC-002 Viewer cannot trigger sync

Status: draft  
Type: e2e|integration  
Priority: P0  
Module: auth-roles / sync

## Preconditions

- Пользователи: `viewer@…` (role=viewer), `analyst@…` или admin.
- Endpoints sync: `POST /api/sync/nvd`, `POST /api/sync/bdu` (план).

## Steps

1. Войти как viewer.
2. Открыть `/app/settings/sync` (или вызвать API sync).
3. Попытка запустить NVD sync и BDU sync.
4. Войти как analyst/admin и повторить запуск — enqueue успешен.

## Expected

- Viewer: UI control disabled **или** API `403`; job в Redis/БД не создаётся.
- Analyst/admin: `202`, запись в очереди `nvd-sync`/`bdu-sync`, `sync_states.status` → `running` (когда worker готов).

## Automation

E2E: `tests/e2e/` TBD.  
Integration: API + session mock TBD.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Матрица: [auth-roles.md](../../features/auth-roles.md).
