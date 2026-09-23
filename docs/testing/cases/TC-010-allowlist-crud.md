# TC-010 Allowlist CRUD

Status: draft  
Type: e2e  
Priority: P0  
Module: scans / allowlist

## Preconditions

- Admin для write; viewer для read-only проверки.

## Steps

1. Admin создаёт AllowlistTarget `10.10.0.0/24`, label=lab.
2. Список показывает запись enabled=true.
3. PATCH: disabled=true.
4. PATCH: снова enabled; изменить notes.
5. DELETE записи.
6. Viewer: GET разрешён; POST/PATCH/DELETE → 403.
7. Невалидный cidr → 400.

## Expected

- Полный CRUD для admin.
- RBAC соблюдён.
- Unique `cidrOrHost` — дубликат → 409.

## Automation

`tests/e2e/allowlist.spec.ts` (planned)

## Last run

—

## Notes

Связан с TC-011.
