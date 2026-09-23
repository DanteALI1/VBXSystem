# ADR-003: Адаптеры сканирования

- **Status:** Accepted
- **Date:** 2026-03-23
- **Wave:** 0

## Context

Нужны обнаружение портов/сервисов и проверка известных CVE на активах без превращения продукта в offensive framework.

## Decision

1. Адаптерный слой: `ScanAdapter` с реализациями `nmap` и `nuclei`.
2. Единый gate **allowlist** до запуска бинаря.
3. Nuclei: whitelist путей templates — только `cves/` и `vulnerabilities/` (detect-oriented).
4. Deny-list intrusive/exploit tags и запрет user path escape.
5. Режим `fixture` для CI без бинарей (парсинг готовых XML/JSONL).
6. Результаты — через ingest в `Service` / `Finding`, не сырой dump в UI.

## Consequences

- Предсказуемый security boundary для аудита.
- Не все nuclei templates сообщества доступны — это намеренно.
- Операторы ставят nmap/nuclei на worker-хост сами.

## Alternatives considered

- Агент на каждом хосте — out of scope Wave 0–3.
- OpenVAS/full scanner suite — тяжелее в on-prem bootstrap.
- Только ручной импорт отчётов — недостаточно для MVP сканов.

## Non-goals

- Auto-exploitation, brute-force, DoS templates.
- Сканирование вне allowlist «по кнопке override» в UI (даже для admin — только через явное изменение allowlist).
