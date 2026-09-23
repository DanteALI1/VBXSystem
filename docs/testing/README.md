# Тестирование VBXSystem

## Цель

Проверять поведение по контрактам Wave 0: auth/RBAC, каталог, sync workers, assets/allowlist/scans, findings, search.

## Карта документов

| Файл | Назначение |
|------|------------|
| [TESTPLAN.md](./TESTPLAN.md) | План покрытия TC-001…020 |
| [RESULTS.md](./RESULTS.md) | Журнал прогонов |
| [cases/](./cases/) | Карточки кейсов |

## Типы тестов

| Type | Инструмент (план) | Когда |
|------|-------------------|-------|
| unit | Vitest | парсеры, severity compute, allowlist match |
| integration | Vitest + testcontainers/postgres | upsert NVD/BDU, API+DB |
| e2e | Playwright | login, UI фильтры, walkthrough smoke |
| manual | чеклист | скриншоты, air-gapped BDU upload |

## Локальный запуск (ориентир)

```bash
pnpm test           # unit
pnpm test:integration
pnpm test:e2e       # требует app up
```

Точные script names — Wave 1 (TODO в package.json).

## Статусы кейса

`draft` → `ready` → `automated` / `manual-only`; в RESULTS фиксируется pass/fail.

## Правила

- Фикстуры без реальных секретов и прод-дампов.
- Сканы в CI — только fixture mode / allowlist lab.
- Не утверждать pass без прогона.
