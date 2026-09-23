# TC-014 Finding status transition

Status: automated — PASS  
Type: integration  
Priority: P0  
Module: findings

## Preconditions

- Finding со `status=open`.
- Пользователи analyst и viewer (mock session).

## Steps

1. Analyst: open → `fixed`.
2. Analyst: fixed → `open` (reopen).
3. Analyst: open → `accepted`.
4. Analyst: open → `false_positive` (отдельный finding).
5. Viewer: любая смена статуса → 403.
6. Недопустимый переход (fixed → accepted) → FindingTransitionError / 400.
7. accepted/false_positive → open: admin only.

## Expected

- `findings.status` и `updated_at` обновляются.
- RBAC: только analyst/admin на PATCH; viewer read-only.
- API `PATCH /api/findings/:id` body `{ status }`.

## Automation

`tests/integration/findings-status.test.ts`

```bash
npm run test:integration -- tests/integration/findings-status.test.ts
```

## Last run

datetime: 2026-09-23 00:08 UTC  
command: `npm run test:integration -- tests/integration/findings-status.test.ts`  
result: PASS  
evidence: transitions + RBAC + schema validation

## Notes

Матрица переходов: [findings.md](../../features/findings.md).
