# ADR-003: Scan adapters

## Статус

Accepted (контракт); реализации адаптеров — последующие волны.

## Контекст

Типы сканов в схеме: `nmap`, `nuclei`, `zap`, `openvas`. Нужна расширяемость без переписывания worker core.

## Решение

Паттерн **ScanAdapter**:

- единый вход: `target`, `options`, `reportDir`;
- единый выход: путь raw-отчёта + нормализованные findings/services;
- регистрация адаптеров по `scan_type`;
- raw всегда на диск `storage/reports/<scanJobId>/`, в БД — нормализованные сущности.

Allowlist — обязательный gate до enqueue и повторно в worker.

## Последствия

- Новые сканеры = новый adapter + фикстуры + TC, без изменения API формы (только enum/`type`).
- zap/openvas могут оставаться stub дольше nmap/nuclei.
- Парсеры тестируются на фикстурах без реальных бинарей (TC-012, TC-013).
