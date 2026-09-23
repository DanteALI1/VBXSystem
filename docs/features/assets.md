# Активы (Assets)

Учёт хостов и сервисов, к которым привязываются findings и результаты сканов.

## Список активов

Колонки: name, hostname, IP, environment, criticality, число services, updated.

Фильтры: environment, текстовый поиск по name/host/IP (`?q=`).

Роли: чтение `viewer`+; создание/правка `analyst`+; удаление `admin`.

UI: `/app/assets` (таблица, без card grid) + `/app/assets/[id]` деталь.

## Создание / редактирование

Поля формы соответствуют модели `Asset` ([data-model](../architecture/data-model.md)):

- обязательны: `name`; хотя бы одно из `hostname` / `ip` рекомендуется;
- `environment`, `criticality` (1–5), `notes` — опционально.

Валидация IP/hostname на API (Zod) — некорректный IPv4 → 400.

## Сервисы

На карточке актива — таблица `Service`: port, protocol, name/product/version, lastSeenAt.

Сервисы создаются:

1. вручную (analyst+) через `POST /api/assets/:id/services`;
2. из ingest nmap (TC-012, Wave 3).

Unique `(assetId, port, protocol)` — повторный POST обновляет метаданные / `lastSeenAt` (upsert), не плодит дубли.

## Деталь актива

Секции: метаданные, сервисы (read; nmap populate later). Findings/ScanJobs — последующие волны.

## Связь с allowlist

Asset ≠ разрешение на скан. Сканировать можно только цели из `AllowlistTarget`, даже если asset уже есть в БД. Документ: [scans.md](./scans.md).

Allowlist UI: `/app/settings/allowlist` — pattern `cidr|url`, enabled toggle; mutate **admin** only. Matcher preview использует `@/lib/allowlist/matcher`.

## API

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/assets` | viewer+ |
| POST | `/api/assets` | analyst+ |
| GET | `/api/assets/:id` | viewer+ |
| PATCH | `/api/assets/:id` | analyst+ |
| DELETE | `/api/assets/:id` | admin |
| GET/POST | `/api/assets/:id/services` | viewer+ / analyst+ |
| GET | `/api/allowlist` | viewer+ (`?preview=` optional) |
| POST | `/api/allowlist` | admin |
| PATCH/DELETE | `/api/allowlist/:id` | admin |

TC-009 / TC-010: `tests/integration/assets-crud.test.ts`, `tests/integration/allowlist-crud.test.ts`.
