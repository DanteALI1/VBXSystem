# Документация VBXSystem (VBX / vuln-mgmt)

Онprem-платформа управления уязвимостями: каталог CVE/БДУ, активы, allowlist-сканирование, findings и роли доступа.

> **Имя продукта:** VBX / vuln-mgmt. Не OpenCVE и не производный продукт OpenCVE.

## Оглавление

### Архитектура

| Документ | Описание |
|----------|----------|
| [architecture/overview.md](./architecture/overview.md) | Обзор системы, диаграммы, UX-референс |
| [architecture/data-model.md](./architecture/data-model.md) | Доменная модель и индексы |
| [architecture/workers.md](./architecture/workers.md) | NVD/BDU/Scan workers, BullMQ |

### Установка и конфигурация

| Документ | Описание |
|----------|----------|
| [setup/install.md](./setup/install.md) | Установка с нуля |
| [setup/configuration.md](./setup/configuration.md) | Переменные окружения |
| [setup/bootstrap-admin.md](./setup/bootstrap-admin.md) | Первый администратор |
| [setup-walkthrough/README.md](./setup-walkthrough/README.md) | Скриншот-гайд (кадры A1–F2, C5) |

### Функции

| Документ | Описание |
|----------|----------|
| [features/sync-bdu.md](./features/sync-bdu.md) | BDU XML download/upload sync |
| [features/vulnerabilities.md](./features/vulnerabilities.md) | Каталог уязвимостей, поиск, saved views, теги |
| [features/assets.md](./features/assets.md) | Активы и сервисы |
| [features/scans.md](./features/scans.md) | Сканирование (allowlist-only) |
| [features/findings.md](./features/findings.md) | Findings и статусы |
| [features/auth-roles.md](./features/auth-roles.md) | Роли viewer / analyst / admin |

### API и эксплуатация

| Документ | Описание |
|----------|----------|
| [api/overview.md](./api/overview.md) | Обзор HTTP API |
| [ops/runbook.md](./ops/runbook.md) | Операционный runbook |
| [ops/troubleshooting.md](./ops/troubleshooting.md) | Диагностика проблем |

### Решения (ADR)

| ADR | Тема |
|-----|------|
| [ADR-001](./decisions/ADR-001-stack.md) | Стек |
| [ADR-002](./decisions/ADR-002-auth.md) | Аутентификация |
| [ADR-003](./decisions/ADR-003-scan-adapters.md) | Адаптеры сканирования |
| [ADR-004](./decisions/ADR-004-opencve-ux-reference.md) | UX-референс OpenCVE и лицензия |

### Журнал волн

| Документ | Описание |
|----------|----------|
| [journal/PROGRESS.md](./journal/PROGRESS.md) | Прогресс по волнам |
| [journal/WAVE-00-CHECKLIST.md](./journal/WAVE-00-CHECKLIST.md) | Gate Wave 0 |
| [journal/WAVE-01-CHECKLIST.md](./journal/WAVE-01-CHECKLIST.md) | Шаблон Wave 1 |
| [journal/WAVE-02-CHECKLIST.md](./journal/WAVE-02-CHECKLIST.md) | Шаблон Wave 2 |
| [journal/WAVE-03-CHECKLIST.md](./journal/WAVE-03-CHECKLIST.md) | Шаблон Wave 3 |

### Тестирование

| Документ | Описание |
|----------|----------|
| [testing/README.md](./testing/README.md) | Как запускать тесты |
| [testing/TESTPLAN.md](./testing/TESTPLAN.md) | План покрытия TC-001…020 |
| [testing/RESULTS.md](./testing/RESULTS.md) | Результаты прогонов |
| [testing/cases/](./testing/cases/) | Карточки тест-кейсов |

## Быстрый старт

См. [корневой README](../README.md) и [setup/install.md](./setup/install.md).
