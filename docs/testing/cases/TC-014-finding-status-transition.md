# TC-014 Finding status transition

Status: draft  
Type: e2e|integration  
Priority: P0  
Module: findings

## Preconditions

- Finding со `status=open`.
- Пользователи analyst и viewer.

## Steps

1. Analyst: open → `fixed`.
2. Analyst: fixed → `open` (reopen).
3. Analyst: open → `accepted`.
4. Analyst: open → `false_positive` (отдельный finding или вернуть в open сначала).
5. Viewer: любая смена статуса → 403.
6. Недопустимый переход (если зафиксирован в API) → 400.

## Expected

- `findings.status` и `updated_at` обновляются.
- UI `/app/findings` отражает новый статус.
- RBAC: только analyst/admin.

## Automation

TBD: `tests/e2e/findings-status.spec.ts` / integration API.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Матрица переходов: [findings.md](../../features/findings.md). Wave 0 UI placeholder.
