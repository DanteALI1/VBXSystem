# TC-005 NVD upsert idempotent

Status: draft  
Type: unit|integration  
Priority: P0  
Module: nvd-sync / vulnerabilities

## Preconditions

- Фикстура `tests/fixtures/nvd/cve-sample.json` (после добавления).
- Доступ к тестовой БД для integration **или** in-memory upsert helper для unit.

## Steps

1. Прогнать upsert одного CVE из фикстуры → одна строка `vulnerabilities` с `cve_id`.
2. Повторить upsert того же CVE с изменённым `description`/`modified_at`.
3. Проверить `vulnerability_sources` для `source=nvd`.

## Expected

- После двух прогонов: **ровно одна** запись по `cve_id` (unique index `vulnerabilities_cve_id_uidx`).
- Поля обновлены (не дубликат).
- Source row обновлён/`synced_at` свежий.

## Automation

TBD: `tests/integration/nvd-upsert.test.ts` или unit parser+repo.  
Пока **нет** файла automation.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

Контракт схемы: unique на `cve_id` / `bdu_id`.
