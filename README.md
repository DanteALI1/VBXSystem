# VBXSystem

Локальная enterprise-платформа vulnerability intelligence (NVD + БДУ ФСТЭК + CISA KEV + EPSS + XDB + заявки).

## Статус

Сейчас в репозитории — **спецификация и промпты субагентов** для поэтапной разработки. Код приложения будет добавляться волнами W0–W8.

| Документ | Назначение |
|----------|------------|
| [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md) | Главный промпт оркестратора |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Продуктовая спецификация |
| [docs/STATUS.md](docs/STATUS.md) | Статус волн |
| [docs/agents/](docs/agents/) | Промпты субагентов W0–W8 |
| [docs/references/settings-database-nvd.png](docs/references/settings-database-nvd.png) | Макет Settings → Database (NVD) |

## UI-референсы

Стилистика и IA ориентированы на [cvefeed.io](https://cvefeed.io/) (dashboard, search, CVE detail, EPSS, CVEQL).  
Раздел exploits — табличный UX как у [VulnCheck XDB](https://www.vulncheck.com/xdb).

## Запуск разработки

1. Прочитать `docs/MASTER_PROMPT.md`
2. Взять следующую волну из `docs/STATUS.md`
3. Отдать субагенту только `docs/agents/Wn_*.md` (см. `docs/agents/README.md`)

Не реализовывать весь продукт одним проходом.
