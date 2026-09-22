# Стратегия тестирования

## Уровни

| Уровень | Инструмент | Каталог | Что покрываем |
|---------|------------|---------|---------------|
| Unit | Vitest | `tests/unit/` | domain pure functions (allowlist, severity, parsers с моками) |
| Integration | Vitest | `tests/integration/` | DB upsert, enqueue, allowlist+scan gate с тестовой БД |
| E2E | Playwright | `tests/e2e/` | login, RBAC UI, фильтры, CRUD, walkthrough smoke |
| Manual | — | `docs/testing/cases/` | то, что ещё не автоматизировано |

## Запуск

```bash
npm run test:unit          # vitest run tests/unit
npm run test:integration   # vitest run tests/integration
npm run test:e2e           # playwright test
npm run test:all           # unit → integration → e2e
npm run test:screenshots   # capture setup frames (stub Wave 0)
npm run typecheck
npm run lint
```

Конфиг Vitest: `vitest.config.ts` (`environment: node`, alias `@` → корень).  
`include`: `tests/**/*.test.ts`.

## Правила

- Долгие внешние вызовы (NVD/BDU) в unit — только mock (TC-006).
- Сканеры в CI — фикстуры XML/JSONL, без обязательного nmap/nuclei binary (TC-012/013).
- Каждый TC живёт в `docs/testing/cases/TC-XXX-*.md`; поле Automation указывает путь или `manual`.
- Результаты прогонов волн — в [RESULTS.md](RESULTS.md).
- Карта волн → TC: [TESTPLAN.md](TESTPLAN.md).

## Wave 0 минимум

- Unit allowlist + severity должны зеленеть.
- E2E/integration — скелет; кейсы в статусе `draft`.
