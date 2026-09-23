# TC-007 BDU XML parse + CVE link

Status: draft  
Type: integration  
Priority: P0  
Module: workers / bdu

## Preconditions

- Фикстура XML БДУ с ≥1 записью, содержащей ссылку на CVE-YYYY-NNNN.
- Фикстура с записью без CVE.
- Опционально: заранее существующая Vulnerability с тем же cveId от NVD.

## Steps

1. Прогнать BDU parse/upsert на фикстуре.
2. Найти запись по `bduId`.
3. Проверить linkage: тот же row или merge с существующим `cveId`.
4. Прогнать запись без CVE.

## Expected

- `bduId` заполнен; `VulnerabilitySource` source=`bdu`.
- При наличии CVE — `cveId` связан; не создаются два конфликтующих row с одним cveId.
- Без CVE — валидная запись только с bduId (check constraint).
- Битая нода в XML пропускается без падения всего job (если в фикстуре есть).

## Automation

`tests/integration/bdu-parse.test.ts` (planned)

## Last run

—

## Notes

Использовать урезанный synthetic XML, не выкладывать огромные dump-файлы в git без нужды.
