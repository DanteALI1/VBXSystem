# TC-005 NVD upsert idempotent

Status: automated  
Type: integration  
Priority: P0  
Module: workers / nvd

## Preconditions

- Test DB (`DATABASE_URL_TEST`) чистая по vulnerabilities.
- Фикстура `tests/fixtures/nvd-fragment.json` (NVD API 2.0 shape).

## Steps

1. Запустить `runNvdSync` на фикстуре через mock `fetch` (первый прогон).
2. Зафиксировать count строк `Vulnerability` и `VulnerabilitySource`.
3. Повторить тот же прогон без изменения фикстуры.
4. Изменить description/CVSS в фикстуре (тот же cveId) → третий прогон.

## Expected

1. Записи созданы; `localSyncedAt` установлен; severity computed.
2–3. Count не растёт; дублей по `cveId` нет; unique `(vulnerabilityId, source=nvd)` соблюдён.
4. Поля обновлены; count тот же; `VulnerabilityHistory` содержит `source_sync` + changed fields.

## Automation

`tests/integration/nvd-upsert.test.ts`

## Last run

—

## Notes

HTTP к NIST не выполнять — только mock/fixture.
