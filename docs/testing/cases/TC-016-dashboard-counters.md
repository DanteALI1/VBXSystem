# TC-016 Dashboard counters

Status: draft  
Type: e2e  
Priority: P1  
Module: dashboard

## Preconditions

- Seed: findings с разными `severity` и `status` (open vs fixed).
- Пользователь авторизован.

## Steps

1. Открыть `/app` (dashboard).
2. Считать counters: open by severity, total assets, last sync (если показано).
3. Изменить finding open→fixed.
4. Обновить dashboard — counters согласованы с БД.

## Expected

- Числа совпадают с SQL-агрегатами (`findings` where status=open group by severity и т.п.).
- Нет «магических» hardcoded значений.
- Пустая БД — нули, не ошибка.

## Automation

TBD: `tests/e2e/dashboard.spec.ts`.  
API план: `GET /api/dashboard/counters`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Wave 0: dashboard placeholder — кейс после реализации counters.
