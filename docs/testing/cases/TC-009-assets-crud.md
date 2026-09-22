# TC-009 Assets CRUD

Status: automated  
Type: integration  
Priority: P0  
Module: assets

## Preconditions

- Mock sessions: analyst / admin / viewer.
- Postgres.

## Steps

1. Create asset: hostname + ip (+ description) via lib + API.
2. Read list — новая запись видна.
3. Update description.
4. Delete — cascade services/findings.
5. Viewer create → 403; empty hostname/ip → 400.

## Expected

- Данные соответствуют таблице `assets`.
- Валидация и RBAC соблюдены.

## Automation

`tests/integration/assets-crud.test.ts`

## Last run

datetime: 2026-09-22 23:33 UTC  
command: `npm run test:integration`  
result: PASS  
evidence: 5 tests, exit 0

## Notes

UI e2e deferred; API + lib cover CRUD contract.
