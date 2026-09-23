# TC-012 nmap fixture → services/findings

Status: automated  
Type: integration  
Priority: P0  
Module: scans / ingest

## Preconditions

- Asset существует или создаётся ingest-ом по политике.
- Фикстура `tests/fixtures/nmap-sample.xml` с открытыми портами 22, 80.
- Adapter mode=fixture / прямой вызов ingest.

## Steps

1. Создать ScanJob type=nmap на allowlisted target с artifact=фикстура.
2. Запустить ingest.
3. Повторить ingest той же фикстуры.

## Expected

- Созданы/обновлены `Service` для портов из фикстуры (protocol/port unique).
- Findings или inventory evidence согласно контракту nmap-адаптера (минимум services).
- Повторный ingest не дублирует services; обновляет `lastSeenAt`.
- ScanJob `succeeded`, `artifactPath` сохранён.

## Automation

`tests/integration/nmap-ingest.test.ts`

## Last run

Wave 3

## Notes

Реальный nmap в CI не требуется.
