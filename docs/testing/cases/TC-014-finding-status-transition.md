# TC-014 Finding status transition

Status: automated  
Type: integration  
Priority: P0  
Module: findings

## Preconditions

- Finding в статусе `open`.
- Пользователь analyst; viewer для негатива.
- Статусы: `open` \| `fixed` \| `accepted` \| `false_positive`.

## Steps

1. PATCH status `open` → `accepted`.
2. `accepted` → `fixed` (`updatedAt` обновлён).
3. `fixed` → `open` (регресс).
4. `open` → `false_positive`.
5. PATCH с неизвестным status (например `confirmed`) → 400.
6. Viewer PATCH → 403.

## Expected

- Допустимые переходы 200; поле `status` / `updatedAt` корректны.
- Недопустимый status → 400 `VALIDATION_ERROR` (или `INVALID_STATUS_TRANSITION`).
- Viewer не меняет статус.

## Automation

`tests/integration/finding-status.test.ts`

## Last run

—

## Notes

Матрица и enum — `docs/features/findings.md` / schema `finding_status`.
