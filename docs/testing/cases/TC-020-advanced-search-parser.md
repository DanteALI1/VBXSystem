# TC-020 Advanced search parser unit

Status: automated  
Type: unit  
Priority: P0  
Module: search

## Preconditions

- Модуль парсера доступен в unit-тестах (без БД).
- `ADVANCED_SEARCH_MAX_FIELDS` задаётся в тесте (например 20 и 3).

## Steps

1. Парсить валидные клаузы всех полей: `cve`, `bdu`, `description`, `vendor`, `product`, `cvss31`, `severity`, `kev`, `epss`, `source`, `tag`, `created`, `updated`.
2. Проверить ops: `:`, `>=`, `<=`, range `a..b`, NOT/`-`, AND/OR, скобки.
3. Кавычки в `description:"remote code"`.
4. Даты ISO / `YYYY-MM-DD`.
5. Превышение max fields → ошибка.
6. Неизвестное field / битый синтаксис → ошибка с позицией/кодом.
7. Пустая строка → empty AST (match all).

## Expected

- Стабильное AST/IR, пригодное для SQL builder.
- Детерминированные ошибки; нет throw безтипа.
- Лимит полей enforced.
- Не выполнять SQL в этом TC — только parser.

## Automation

`tests/unit/advanced-query.test.ts`

## Last run

2026-09-23 05:47 UTC — `pnpm test:unit` — PASS (W0-UNIT-001)

## Notes

Поля и ops зафиксированы в `docs/features/vulnerabilities.md`. MVP subset: AND/OR/(); relative dates 7d/1m — Wave 1 SQL builder.
