# ADR-003: Адаптеры сканирования

- **Status:** Accepted
- **Date:** 2026-03-23
- **Wave:** 0–3

## Context

Нужны обнаружение портов/сервисов и проверка известных CVE на активах без превращения продукта в offensive framework.

## Decision

1. Адаптерный слой: `ScannerAdapter` с реализациями `nmap` и `nuclei`; stubs `zap` / `openvas`.
2. Единый gate **allowlist** (`targetsAllowed` + `assertTargetsAllowed`) до enqueue и повторно в worker до запуска бинаря.
3. Nuclei: whitelist путей templates — только `cves/` и `vulnerabilities/` (detect-oriented). Deny-list: `intrusive`, `dos`, `exploit`, `rce`, `brute`, `fuzz`, path escape, absolute `-t`.
4. **Нет auto-exploitation** — адаптер не передаёт флаги/templates, подразумевающие payload execution.
5. Режим `SCAN_ADAPTER_MODE=fixture|auto|binary` для CI без бинарей (парсинг готовых XML/JSONL из `tests/fixtures/`).
6. Результаты — ingest в `Service` / `Finding` (+ CVE → `vulnerabilityId`); raw report в `storage/reports/{jobId}/`.
7. HTTP API только enqueue (BullMQ `scan`); исполнение в `pnpm worker`.

## Consequences

- Предсказуемый security boundary для аудита.
- Не все nuclei templates сообщества доступны — это намеренно.
- Операторы ставят nmap/nuclei на worker-хост сами; без них CI идёт через fixtures.

## Alternatives considered

- Агент на каждом хосте — out of scope Wave 0–3.
- OpenVAS/full scanner suite — stub only; тяжелее в on-prem bootstrap.
- Только ручной импорт отчётов — недостаточно для MVP сканов.

## Non-goals

- Auto-exploitation, brute-force, DoS templates.
- Сканирование вне allowlist «по кнопке override» в UI (даже для admin — только через явное изменение allowlist).
