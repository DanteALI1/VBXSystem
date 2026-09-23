# TC-012 nmap fixture → services/findings

Status: automated — PASS  
Type: unit  
Priority: P0  
Module: scan-adapters / nmap

## Preconditions

- Фикстура `tests/fixtures/nmap-sample.xml`.
- Asset создаётся адаптером по target.
- Парсер nmap XML: `parseNmapXml` / `NmapAdapter`.

## Steps

1. Подать XML в nmap adapter/parser (`reportDir` temp, `fixture: true`).
2. Проверить создание/обновление `services` (port, protocol, name/product/version) для `asset_id`.
3. Vuln-скрипты → `findings` с severity + CVE.
4. Повторный persist — сервисы идемпотентны (unique port/protocol).

## Expected

- Сервисы соответствуют портам фикстуры (22/80/443 open; 3306 closed skipped).
- Findings включают script CVE (например CVE-2021-44228).
- Raw файл сохранён под reportDir (`raw.xml`).

## Automation

- Parse: `tests/unit/nmap-parse.test.ts`
- Persist + adapter: `tests/unit/nmap-persist.test.ts`

```bash
npm run test:unit -- tests/unit/nmap-parse.test.ts tests/unit/nmap-persist.test.ts
```

## Last run

datetime: 2026-09-23 00:08 UTC  
command: `npm run test:unit`  
result: PASS  
evidence: parse ports + CVE; persist services/findings + idempotent upsert

## Notes

Без реального nmap binary в CI — только fixture mode.
