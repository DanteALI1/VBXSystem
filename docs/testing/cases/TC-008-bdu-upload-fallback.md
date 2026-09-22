# TC-008 BDU upload fallback

Status: draft  
Type: integration  
Priority: P1  
Module: bdu-sync / settings

## Preconditions

- Admin-сессия.
- Endpoint upload (план: `POST /api/sync/bdu/upload`) или эквивалент.
- Внешний `BDU_XML_URL` можно считать недоступным (mock/fail).

## Steps

1. Загрузить локальный XML (фикстура) через API/UI.
2. Убедиться, что job `bdu-sync` поставлен с `uploadedPath`.
3. Worker (или integration harness) парсит файл и пишет в БД.
4. Повтор с тем же содержимым → `file_hash` в `sync_states` предотвращает лишнюю работу (если не force).

## Expected

- Sync успешен без доступа к публичному URL.
- `sync_states.source=bdu` обновлён (`last_success_at`, `file_hash`).
- Не-admin получает `403`.

## Automation

TBD: `tests/integration/bdu-upload.test.ts`. Пока **manual**/skeleton.

## Last run

datetime: —  
command: —  
result: —  
evidence: —

## Notes

P1 — можно закрыть после TC-007.
