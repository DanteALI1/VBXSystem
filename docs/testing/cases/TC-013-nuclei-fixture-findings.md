# TC-013 nuclei fixture → findings

Status: draft  
Type: unit|integration  
Priority: P0  
Module: scan-adapters / nuclei

## Preconditions

- Фикстура `tests/fixtures/nuclei/findings-sample.jsonl`.
- Asset/target известен.
- Парсер nuclei JSONL реализован.

## Steps

1. Прочитать JSONL построчно → нормализованные findings.
2. Для строк с CVE: заполнить `findings.cve_id`, по возможности связать `vulnerability_id`.
3. Severity нормализовать через `lib/domain/severity.ts`.
4. Integration: job type=`nuclei` → статус succeeded, findings в БД.

## Expected

- Количество findings = число валидных строк фикстуры (минус skip broken).
- `status` default `open`.
- Невалидная строка JSONL не роняет весь batch.

## Automation

TBD: `tests/unit/nuclei-parse.test.ts`.  
Фикстура: `tests/fixtures/nuclei/`.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

См. ADR-003.
