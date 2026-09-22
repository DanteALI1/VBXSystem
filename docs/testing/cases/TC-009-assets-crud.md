# TC-009 Assets CRUD

Status: draft  
Type: e2e|integration  
Priority: P0  
Module: assets

## Preconditions

- Пользователь analyst или admin.
- Viewer для негативного кейса.

## Steps

1. Create asset: hostname + ip (+ description).
2. Read list — новая запись видна; индексы/фильтр по ip/hostname (если есть).
3. Update description/hostname.
4. Delete (admin) — cascade: связанные services/findings удаляются.
5. Viewer: create → запрет.

## Expected

- Данные соответствуют таблице `assets`.
- Валидация: пустой ip/hostname → 400.
- RBAC соблюдён.

## Automation

TBD: `tests/e2e/assets.spec.ts` / `tests/integration/assets-crud.test.ts`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

UI Wave 0 placeholder `/app/assets`.
