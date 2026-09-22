# TC-010 Allowlist CRUD

Status: automated  
Type: integration  
Priority: P0  
Module: allowlist

## Preconditions

- Mock admin / analyst / viewer sessions.
- Match logic also covered by unit `tests/unit/allowlist.test.ts`.

## Steps

1. Create `cidr` + `url` rules (lib + API).
2. List — оба видны.
3. Disable cidr → update.
4. Delete url-правило.
5. Viewer/analyst mutate → 403; invalid CIDR → 400.

## Expected

- Записи в `allowlist_targets` соответствуют схеме.
- Disabled правило не участвует в `isTargetAllowed` (см. TC-011).

## Automation

`tests/integration/allowlist-crud.test.ts`  
Unit match: `tests/unit/allowlist.test.ts`

## Last run

datetime: 2026-09-22 23:33 UTC  
command: `npm run test:integration`  
result: PASS  
evidence: 5 tests, exit 0

## Notes

Mutations admin-only per `canManageAllowlist`.
