# TC-017 Screenshot walkthrough smoke

Status: draft  
Type: e2e  
Priority: P1  
Module: setup-walkthrough / evidence

## Preconditions

- App доступен на `APP_URL`.
- Список кадров A1–F2: [setup-walkthrough/README.md](../../setup-walkthrough/README.md).
- Скрипт `npm run test:screenshots` реализован (сейчас stub).

## Steps

1. Запустить capture script или Playwright suite walkthrough.
2. Пройти маршруты: login → dashboard → vulns → assets → findings → scans → sync → allowlist.
3. Сохранить PNG в `docs/setup-walkthrough/images/` с именами A1…F2.
4. Обновить статусы кадров в README walkthrough на `captured`.

## Expected

- Все обязательные кадры на месте (или явно `blocked` с причиной, напр. docker unavailable).
- Нет секретов/паролей на скринах.
- TC Last run содержит пути evidence.

## Automation

`npm run test:screenshots` → `scripts/capture-setup-screenshots.ts` (Wave 0: `not implemented`).  
E2E: `tests/e2e/walkthrough-screenshots.spec.ts` TBD.

## Last run

datetime: —  
command: `npm run test:screenshots`  
result: STUB  
evidence: —

## Notes

Для Wave 0 Gate допустима пометка A1 blocked, если Docker недоступен.
