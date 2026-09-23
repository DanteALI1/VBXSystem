# Документация VBXSystem0 (vuln-app)

Внутренняя MVP-система управления уязвимостями. Документы ведутся на русском, технический тон.

## Оглавление

### Архитектура

- [Обзор](architecture/overview.md) — компоненты, потоки данных NVD/BDU/scans
- [Модель данных](architecture/data-model.md) — таблицы, поля, индексы, enums, relations (`db/schema.ts`)
- [Workers](architecture/workers.md) — очереди BullMQ (`nvd-sync`, `bdu-sync`, `scan`), адаптеры сканеров

### Установка и конфигурация

- [Установка](setup/install.md) — с нуля: clone → env → docker/npm → migrate → bootstrap → seeds → worker → smoke:sync / smoke:scan → UI
- [Конфигурация](setup/configuration.md) — переменные из `.env.example` (в т.ч. `SCAN_FIXTURE_MODE`, `NMAP_BIN`, `NUCLEI_BIN`)
- [Bootstrap admin](setup/bootstrap-admin.md) — `BOOTSTRAP_ADMIN_*`
- [Walkthrough кадров](setup-walkthrough/README.md) — обязательные скриншоты A1–F2

### Функции

- [Dashboard](features/dashboard.md)
- [Уязвимости](features/vulnerabilities.md)
- [Активы](features/assets.md)
- [Сканы](features/scans.md) — enqueue, allowlist, fixture/live, stubs
- [Findings](features/findings.md) — list/detail, статусы, переходы
- [Sync NVD/BDU](features/sync.md)
- [Auth и роли](features/auth-roles.md)

### API / Ops / ADR

- [API overview](api/overview.md) — все HTTP endpoints включая scans/findings
- [Runbook](ops/runbook.md) — старт, sync, scans fixture, пути отчётов
- [Troubleshooting](ops/troubleshooting.md) — Redis, sync 409, allowlist reject, binary missing
- [ADR-001 Stack](decisions/ADR-001-stack.md)
- [ADR-002 Auth](decisions/ADR-002-auth.md)
- [ADR-003 Scan adapters](decisions/ADR-003-scan-adapters.md)

### Журнал волны

- [PROGRESS](journal/PROGRESS.md)
- [WAVE-00 checklist](journal/WAVE-00-CHECKLIST.md)
- [WAVE-01 checklist](journal/WAVE-01-CHECKLIST.md)
- [WAVE-02 checklist](journal/WAVE-02-CHECKLIST.md)
- [WAVE-03 checklist](journal/WAVE-03-CHECKLIST.md)

### Тестирование

- [Стратегия](testing/README.md)
- [TESTPLAN](testing/TESTPLAN.md)
- [RESULTS](testing/RESULTS.md)
- [Кейсы TC-001…017](testing/cases/)

### Фикстуры

- [tests/fixtures/README.md](../tests/fixtures/README.md)
