# TC-017 Screenshot walkthrough smoke

Status: automated — PASS  
Type: e2e  
Priority: P1  
Module: setup-walkthrough / evidence

## Preconditions

- App доступен на `APP_URL`.
- Auth storageState (`playwright/.auth/admin.json`) из setup project.
- Список кадров A1–F2: [setup-walkthrough/README.md](../../setup-walkthrough/README.md).

## Steps

1. Light e2e: authenticated nav login→dashboard→vulns→scans→findings→assets — pages load.
2. Full evidence: `npm run test:screenshots` → PNG в `docs/setup-walkthrough/images/`.

## Expected

- Ключевые страницы отдают heading + table (где применимо) без crash.
- Обязательные кадры walkthrough на месте (или явно `blocked`, напр. docker A1).
- Нет секретов/паролей на скринах.

## Automation

- Smoke: `tests/e2e/walkthrough-smoke.spec.ts`
- Screenshots: `npm run test:screenshots` → `scripts/capture-setup-screenshots.ts`

```bash
npm run test:e2e -- tests/e2e/walkthrough-smoke.spec.ts
npm run test:screenshots
```

## Last run

datetime: 2026-09-23 00:08 UTC  
command: `npm run test:e2e` (walkthrough-smoke)  
result: PASS  
evidence: pages load; screenshots already captured Wave 1–2 (A1 docker blocked)

## Notes

Smoke не переснимает PNG — только проверяет маршруты. Evidence frames = `test:screenshots`.
