# TC-016 Dashboard counters

Status: draft  
Type: e2e  
Priority: P1  
Module: dashboard

## Preconditions

- Известный набор данных: N critical vulns, M open findings, K assets, last sync timestamps.
- Пользователь viewer+.

## Steps

1. Открыть dashboard / `GET /api/dashboard/summary`.
2. Сверить counters с SQL/фикстурными ожиданиями.
3. Добавить новый open finding → обновить dashboard.
4. Закрыть finding → счётчик open уменьшается.

## Expected

- Counters: vulnerabilities by severity (или total+critical), open findings, assets, sync freshness — по контракту API.
- Значения согласованы с БД (±0).
- Пустая БД — нули, не ошибки.

## Automation

`tests/e2e/dashboard.spec.ts` (planned)

## Last run

—

## Notes

Не перегружать первый viewport лишними виджетами в противоречие UI rules — сам кейс про данные.
