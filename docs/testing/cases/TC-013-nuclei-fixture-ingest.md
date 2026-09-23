# TC-013 nuclei fixture → findings

Status: draft  
Type: integration  
Priority: P0  
Module: scans / ingest

## Preconditions

- Allowlisted target.
- Фикстура JSONL nuclei с template из семейства cves/vulnerabilities и CVE id.
- Vulnerability с этим cveId может отсутствовать или существовать.

## Steps

1. Ingest фикстуры через ScanJob type=nuclei.
2. Проверить созданный Finding: severity, evidence, link vulnerabilityId если CVE известен.
3. Попытка job с params templates path вне allow (`../../exploits`) — отказ.
4. Повторный ingest — дедуп / lastSeenAt.

## Expected

- Finding(s) созданы; статус `open`.
- Path escape / non-allowed templates → fail до запуска (или на validate params).
- Нет auto-exploitation side effects (адаптер не вызывает опасные флаги).
- Дедуп соблюдён.

## Automation

`tests/integration/nuclei-ingest.test.ts` (planned)

## Last run

—

## Notes

Сверить с ADR-003 deny-list.
