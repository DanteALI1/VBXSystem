# TC-014 Finding status transition

Status: draft  
Type: integration  
Priority: P0  
Module: findings

## Preconditions

- Finding в статусе `open`.
- Пользователь analyst; viewer для негатива.

## Steps

1. PATCH status `open` → `confirmed`.
2. `confirmed` → `fixed` (closedAt set).
3. `fixed` → `open` (регресс, closedAt cleared).
4. `open` → `false_positive`.
5. Недопустимый переход согласно матрице (если появятся ограничения жёстче) или PATCH с неизвестным status.
6. Viewer PATCH → 403.

## Expected

- Допустимые переходы 200; поля status/closedAt/updatedAt корректны.
- Недопустимый status → 400 `INVALID_STATUS_TRANSITION` или `VALIDATION_ERROR`.
- Viewer не меняет статус.

## Automation

`tests/integration/finding-status.test.ts` (planned)

## Last run

—

## Notes

Матрица в `docs/features/findings.md`.
