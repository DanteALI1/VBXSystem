# TC-003 Vulnerabilities filters/search

Status: automated — PASS  
Type: e2e  
Priority: P0  
Module: vulnerabilities

## Preconditions

- В БД ≥3 записи `vulnerabilities` с разными `severity`, `cve_id`, `bdu_id`, title.
- Пользователь авторизован (любая роль). Seed: `npm run seed:vulns`.

## Steps

1. Открыть `/app/vulnerabilities`.
2. Поиск по фрагменту CVE (например `CVE-2021-44228`).
3. Фильтр severity=`critical`.
4. Фильтр source=`nvd` / `bdu`.
5. Убедиться, что URL query отражает фильтры и строки таблицы соответствуют предикатам.

## Expected

- Результаты соответствуют предикатам.
- Пустой результат — empty state, не ошибка.
- URL query отражает фильтры (`q`, `severity`, `source`).

## Automation

`tests/e2e/vulnerabilities-filters.spec.ts` (project `chromium`, storageState from `auth.setup.ts`)  
Unit support: `tests/unit/severity.test.ts`

## Last run

datetime: 2026-09-22 23:16 UTC  
command: `npm run test:e2e`  
result: PASS (3/3)  
evidence: Playwright list reporter; HTML `playwright-report/`; suite exit 0

## Notes

- UI: `VulnerabilitiesFilters` + `VulnerabilitiesTable`; `data-testid=vuln-*`.
- Debounced search (~300ms) → assert URL then table.
