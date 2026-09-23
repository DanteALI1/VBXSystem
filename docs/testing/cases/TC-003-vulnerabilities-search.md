# TC-003 Vulnerabilities filters/search (+ advanced query)

Status: draft  
Type: e2e  
Priority: P0  
Module: vulnerabilities

## Preconditions

- В БД ≥10 уязвимостей с разными severity, kev true/false, source nvd/bdu, тегами.
- Пользователь viewer или analyst залогинен.

## Steps

1. Открыть `/app/vulnerabilities`.
2. Применить фильтр severity=`critical`.
3. Включить KEV=`true`.
4. Ввести advanced query: `severity:high source:nvd cvss31:>=7`.
5. Ввести query с числом field-клауз > `ADVANCED_SEARCH_MAX_FIELDS`.
6. Сбросить фильтры.

## Expected

1. Table-first список загружается.
2–3. Строки соответствуют фильтрам (AND).
4. Результаты удовлетворяют всем клаузам; URL или state сохраняет `q`.
5. UI/API показывают ошибку `SEARCH_TOO_COMPLEX` / 400; список не «ломается».
6. Полный список снова доступен.

## Automation

`tests/e2e/vulnerabilities.spec.ts`

## Last run

—

## Notes

Связь с TC-020 (unit парсера) и TC-018 (saved views).
