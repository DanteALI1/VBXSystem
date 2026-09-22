# TC-010 Allowlist CRUD

Status: draft  
Type: e2e|integration  
Priority: P0  
Module: allowlist

## Preconditions

- Analyst/admin сессия.
- Страница `/app/settings/allowlist`.

## Steps

1. Create правило `type=cidr`, pattern `10.0.0.0/8`, enabled=true.
2. Create правило `type=url`, pattern `https://app.example.com/api`.
3. List — оба видны.
4. Disable cidr (`enabled=false`) → update.
5. Delete url-правило.
6. Viewer: мутации запрещены.

## Expected

- Записи в `allowlist_targets` соответствуют полям схемы.
- Невалидный CIDR/пустой pattern → 400.
- Disabled правило не участвует в `isTargetAllowed` (см. TC-011).

## Automation

TBD e2e/integration.  
Логика match уже покрыта unit: `tests/unit/allowlist.test.ts`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Wave 0 UI placeholder.
