# TC-009 Assets CRUD

Status: draft  
Type: e2e  
Priority: P0  
Module: assets

## Preconditions

- Пользователь analyst (или admin).
- Viewer для негативной проверки create.

## Steps

1. Создать asset: name, ip, environment.
2. Открыть список — запись видна.
3. PATCH: изменить hostname и notes.
4. Добавить service port 443/tcp.
5. DELETE asset (admin) или по политике волны.
6. Viewer: POST `/api/assets` → отказ.

## Expected

- CRUD успешен для analyst+/admin согласно матрице ролей.
- Unique service constraint работает (повтор 443/tcp — update/409 по контракту).
- Viewer не создаёт assets (403).
- Валидация некорректного IP — 400.

## Automation

`tests/e2e/assets.spec.ts` (planned)

## Last run

—

## Notes

—
