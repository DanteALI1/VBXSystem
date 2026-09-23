# TC-018 Saved view save/load

Status: draft  
Type: e2e  
Priority: P1  
Module: vulnerabilities / saved-views

## Preconditions

- Analyst залогинен.
- Каталог с данными для отличимых фильтров.

## Steps

1. На `/vulnerabilities` выставить filters + advanced `q` + sort.
2. Save view с именем `Critical KEV`.
3. Сбросить UI state.
4. Load `Critical KEV`.
5. Создать второй view; удалить первый.
6. Viewer: load shared view (если isShared) — read-only; create → 403 или hide.

## Expected

- После load query/filters/sort восстановлены, таблица refetch совпадает.
- Unique имя на user+scope — дубликат отклоняется.
- Delete убирает из списка.
- RBAC: viewer не создаёт; analyst владеет своими views.

## Automation

`tests/e2e/saved-views.spec.ts` (planned)

## Last run

—

## Notes

—
