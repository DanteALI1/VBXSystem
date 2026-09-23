# TC-007 BDU XML parse + CVE link

Status: automated  
Type: integration  
Priority: P0  
Module: workers / bdu

## Preconditions

- Фикстура `tests/fixtures/bdu-mini.xml`: запись с CVE, запись без CVE, битая нода без `identifier`.
- Опционально: заранее существующая Vulnerability с тем же `cveId` от NVD.

## Steps

1. Прогнать BDU parse/upsert на фикстуре (`runBduSync` mode=`upload` + inline XML).
2. Найти запись по `bduId` = `BDU:2024-00001`.
3. Проверить linkage с `CVE-2024-0001` (merge с preseed NVD row).
4. Прогнать запись без CVE (`BDU:2024-00002`).

## Expected

- `bduId` заполнен; `VulnerabilitySource` source=`bdu`.
- При наличии CVE — `cveId` связан; не создаются два row с одним cveId.
- Без CVE — валидная запись только с bduId.
- Битая нода в XML пропускается без падения всего job.
- `SyncState` source=`bdu`, `cursor` = SHA-256 файла; history содержит `bduId`.

## Automation

`tests/integration/bdu-parse.test.ts`

```bash
DATABASE_URL_TEST=postgresql://vuln:vuln@localhost:5432/vuln_test \
  pnpm exec vitest run tests/integration/bdu-parse.test.ts
```

## Last run

automated — Wave 2

## Notes

Использовать урезанный synthetic XML; не вызывать реальный `BDU_XML_URL`.
