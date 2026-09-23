# TC-013 nuclei fixture → findings

Status: automated — PASS  
Type: unit  
Priority: P0  
Module: scan-adapters / nuclei

## Preconditions

- Фикстура `tests/fixtures/nuclei-sample.jsonl`.
- Asset/target известен.
- Парсер: `parseNucleiJsonl` / `NucleiAdapter`.

## Steps

1. Прочитать JSONL построчно → нормализованные findings.
2. Для строк с CVE: заполнить `findings.cve_id`.
3. Severity нормализовать через `lib/domain/severity.ts`.
4. Adapter fixture start + parse + persist → findings в БД, status `open`.

## Expected

- Количество findings = число валидных строк фикстуры (5; broken line skipped).
- `status` default `open`.
- Невалидная строка JSONL не роняет весь batch.

## Automation

- Parse: `tests/unit/nuclei-parse.test.ts`
- Persist + adapter: `tests/unit/nuclei-persist.test.ts`

```bash
npm run test:unit -- tests/unit/nuclei-parse.test.ts tests/unit/nuclei-persist.test.ts
```

## Last run

datetime: 2026-09-23 00:08 UTC  
command: `npm run test:unit`  
result: PASS  
evidence: 5 findings, CVE-2021-44228, all status=open

## Notes

См. ADR-003.
