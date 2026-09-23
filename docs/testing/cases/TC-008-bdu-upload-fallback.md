# TC-008 BDU upload fallback

Status: draft  
Type: integration  
Priority: P1  
Module: workers / bdu

## Preconditions

- Admin-сессия.
- `BDU_FEED_URL` недоступен или режим upload-only в тесте.
- Файл `tests/fixtures/bdu/sample.xml`.

## Steps

1. `POST /api/sync/bdu/upload` multipart с sample.xml под admin.
2. Дождаться обработки job (или синхронный test harness).
3. Повторить upload тем же файлом.
4. Попытка upload под viewer.

## Expected

1–2. Файл принят, сохранён под `BDU_UPLOAD_DIR`, parse upsert выполнен, `SyncState` source=bdu обновлён.
3. Идемпотентность/обновление без дублей bduId.
4. Viewer — 403, файл не ставится в очередь.

## Automation

`tests/integration/bdu-upload.test.ts` (planned)

## Last run

—

## Notes

Проверить лимит размера upload (когда появится) — отдельный негативный шаг TODO.
