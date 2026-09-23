# TC-005 NVD upsert idempotent

Status: draft  
Type: integration  
Priority: P0  
Module: workers / nvd

## Preconditions

- Test DB чистая по vulnerabilities.
- Фикстура JSON NVD API на 1–N CVE с фиксированным checksum.

## Steps

1. Запустить NVD upsert worker/handler на фикстуре (первый прогон).
2. Зафиксировать count строк `Vulnerability` и `VulnerabilitySource`.
3. Повторить тот же прогон без изменения фикстуры.
4. Изменить description/CVSS в фикстуре (тот же cveId) → третий прогон.

## Expected

1. Записи созданы; `localSyncedAt` установлен; severity computed.
2–3. Count не растёт; дублей по `cveId` нет; unique `(source, externalId)` соблюдён.
4. Поля обновлены; count тот же; `VulnerabilityHistory` содержит `source_sync`/`updated`.

## Automation

`tests/integration/nvd-upsert.test.ts` (planned)

## Last run

—

## Notes

HTTP к NIST не выполнять — только mock/fixture.
