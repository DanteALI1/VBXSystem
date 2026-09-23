# TC-008 BDU upload fallback

Status: automated  
Type: integration  
Priority: P1  
Module: workers / bdu

## Preconditions

- Admin-сессия (для HTTP route).
- Download mock → `BduDownloadError` (не бить реальный feed).
- Файл `tests/fixtures/bdu-mini.xml`.

## Steps

1. `runBduSync` mode=`download` с failing `downloadFn` → SyncState.lastError.
2. `saveBduUpload` + `runBduSync` mode=`upload` с фикстурой.
3. Повторить upload тем же содержимым (идемпотентность).
4. `POST /api/settings/sync/bdu/upload` под viewer → 403; под admin → 202 enqueue.

## Expected

1. Download fail не ставит `lastSuccessAt`; `lastError` заполнен.
2. Файл под `BDU_UPLOAD_DIR`, parse upsert выполнен, `SyncState` source=bdu / cursor=hash.
3. Без дублей `bduId`.
4. Viewer — 403, enqueue не вызывается; admin — job queued.

## Automation

`tests/integration/bdu-upload.test.ts`

```bash
DATABASE_URL_TEST=postgresql://vuln:vuln@localhost:5432/vuln_test \
  pnpm exec vitest run tests/integration/bdu-upload.test.ts
```

## Last run

automated — Wave 2

## Notes

Лимит размера upload — `BDU_UPLOAD_MAX_BYTES` (негативный шаг TODO).
