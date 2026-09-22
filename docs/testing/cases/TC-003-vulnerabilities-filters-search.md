# TC-003 Vulnerabilities filters/search

Status: draft  
Type: e2e  
Priority: P0  
Module: vulnerabilities

## Preconditions

- В БД ≥3 записи `vulnerabilities` с разными `severity`, `cve_id`, `bdu_id`, title.
- Пользователь авторизован (любая роль).

## Steps

1. Открыть `/app/vulnerabilities`.
2. Поиск по фрагменту CVE (например `CVE-2024`).
3. Фильтр severity=`critical` (или high).
4. Поиск по `bdu_id` / title.
5. Сбросить фильтры — полный список.

## Expected

- Результаты соответствуют предикатам.
- Пустой результат — empty state, не ошибка.
- URL query (если реализован) отражает фильтры.

## Automation

`tests/e2e/` TBD (`vulnerabilities-filters.spec.ts`).  
Поддержка severity: `tests/unit/severity.test.ts`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Wave 0 UI placeholder — автоматизация после списка.
