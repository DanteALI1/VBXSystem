# TC-005 NVD upsert idempotent

Status: automated  
Type: unit  
Priority: P0  
Module: nvd-sync / vulnerabilities

## Preconditions

- Фикстура `tests/fixtures/nvd-fragment.json`.
- Postgres доступна (`DATABASE_URL`).

## Steps

1. Прогнать upsert одного CVE из фикстуры → одна строка `vulnerabilities` с `cve_id`.
2. Повторить upsert того же CVE с изменённым `description`/`modified_at`.
3. Проверить `vulnerability_sources` для `source=nvd`.

## Expected

- После двух прогонов: **ровно одна** запись по `cve_id`.
- Поля обновлены (не дубликат).
- Source row обновлён / `synced_at` свежий.

## Automation

`tests/unit/nvd-upsert.test.ts`

## Last run

datetime: 2026-09-22 23:33 UTC  
command: `npm run test:unit`  
result: PASS  
evidence: 1 test, exit 0 (unit suite 20 tests)

## Notes

Контракт схемы: unique на `cve_id` / `bdu_id`.
