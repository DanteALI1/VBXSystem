# Sync — BDU (ФСТЭК)

Синхронизация каталога уязвимостей из XML БДУ ФСТЭК.

## Источник

| Режим | Описание |
|-------|----------|
| `download` | HTTP GET `BDU_XML_URL` (default `https://bdu.fstec.ru/files/documents/vulxml.xml`) |
| `upload` | Admin multipart XML → `BDU_UPLOAD_DIR` (fallback при недоступности URL) |

## Поток

1. API `POST /api/settings/sync/bdu` (analyst+) или upload (admin) → BullMQ `bdu-sync` (202, non-blocking).
2. Worker: получить XML → SHA-256 → parse `<vul>` → upsert `Vulnerability` по `bduId`.
3. При наличии CVE — link/merge с существующей карточкой по `cveId` (без дублей).
4. `VulnerabilitySource` source=`bdu`; `VulnerabilityHistory` на изменения ключевых полей.
5. `SyncState` source=`bdu`: `cursor` = file hash, `meta.fileHash`, `lastSuccessAt` / `lastError`.

## Переменные

| Key | Default |
|-----|---------|
| `BDU_XML_URL` | `https://bdu.fstec.ru/files/documents/vulxml.xml` |
| `BDU_UPLOAD_DIR` | `./storage/bdu-uploads` |
| `BDU_UPLOAD_MAX_BYTES` | `67108864` |

## Тесты

- TC-007: `tests/integration/bdu-parse.test.ts` + `tests/fixtures/bdu-mini.xml`
- TC-008: `tests/integration/bdu-upload.test.ts` (download mock fail → upload)

**Не** обращаться к реальному `BDU_XML_URL` в автотестах.
