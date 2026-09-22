# TC-012 nmap fixture → services/findings

Status: draft  
Type: unit|integration  
Priority: P0  
Module: scan-adapters / nmap

## Preconditions

- Фикстура `tests/fixtures/nmap/scan-sample.xml`.
- Asset существует или создаётся адаптером по target.
- Парсер nmap XML реализован.

## Steps

1. Подать XML в nmap adapter/parser (`reportDir` temp).
2. Проверить создание/обновление `services` (port, protocol, name/product/version) для `asset_id`.
3. Если в XML есть vuln-скрипты — `findings` с severity через `parseSeverity`.
4. `scan_jobs.status` → `succeeded` в integration harness.

## Expected

- Сервисы соответствуют портам фикстуры.
- Идемпотентность повторного parse (не плодить дубликаты портов — политика TBD: unique asset+port+protocol).
- Raw файл сохранён под `storage/reports/<jobId>/`.

## Automation

TBD: `tests/unit/nmap-parse.test.ts`, `tests/integration/nmap-ingest.test.ts`.  
Фикстура: см. `tests/fixtures/README.md`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Без реального nmap binary в CI.
