# TC-008 BDU upload fallback

Status: automated  
Type: integration  
Priority: P1  
Module: bdu-sync / settings

## Preconditions

- Mock admin/viewer session.
- Endpoint `POST /api/sync/bdu/upload`.
- Фикстура `tests/fixtures/bdu-mini.xml` (без внешнего `BDU_XML_URL`).

## Steps

1. Viewer upload → 403.
2. Admin загружает XML → `202` + `jobId` + `uploadedPath`.
3. Job `bdu-sync` содержит `uploadedPath`.
4. `runBduSync({ uploadedPath })` парсит и пишет `file_hash` в `sync_states`.
5. Повтор без `force` → `skippedUnchanged`.

## Expected

- Sync успешен без доступа к публичному URL.
- `sync_states.source=bdu` получает `fileHash` / `lastSuccessAt`.
- Не-admin (viewer) → `403`.

## Automation

`tests/integration/bdu-upload.test.ts`

## Last run

datetime: 2026-09-22 23:33 UTC  
command: `npm run test:integration`  
result: PASS  
evidence: 4 tests, exit 0

## Notes

Hash/skip path exercised via `runBduSync` harness (same code path as worker). Live worker may briefly race `status`; contract asserts `fileHash` + skip behavior.
