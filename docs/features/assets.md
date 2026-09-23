# Активы (Assets)

Учёт хостов и сервисов, к которым привязываются findings и результаты сканов.

## Список активов

Колонки: name, hostname, IP, environment, criticality, число services, открытые findings, updated.

Фильтры: environment, criticality, наличие open findings, текстовый поиск по name/host/IP.

Роли: чтение `viewer`+; создание/правка/удаление `analyst`+ (удаление с findings — подтверждение; политика soft-delete TODO).

## Создание / редактирование

Поля формы соответствуют модели `Asset` ([data-model](../architecture/data-model.md)):

- обязательны: `name`; хотя бы одно из `hostname` / `ip` рекомендуется;
- `environment`, `criticality`, `notes` — опционально.

Валидация IP/hostname на API (Zod).

## Сервисы

На карточке актива — таблица `Service`: port, protocol, name/product/version, lastSeenAt.

Сервисы создаются:

1. вручную (analyst+);
2. из ingest nmap (TC-012).

Unique `(assetId, port, protocol)` — повторный скан обновляет `lastSeenAt` / version, не плодит дубли.

## Деталь актива

Секции: метаданные, сервисы, findings (фильтр по статусу), связанные ScanJobs.

## Связь с allowlist

Asset ≠ разрешение на скан. Сканировать можно только цели из `AllowlistTarget`, даже если asset уже есть в БД. Документ: [scans.md](./scans.md).

## API (ориентир)

| Method | Path | Роль |
|--------|------|------|
| GET | `/api/assets` | viewer+ |
| POST | `/api/assets` | analyst+ |
| GET | `/api/assets/:id` | viewer+ |
| PATCH | `/api/assets/:id` | analyst+ |
| DELETE | `/api/assets/:id` | admin (или analyst+ с политикой) |
| GET/POST | `/api/assets/:id/services` | viewer+ / analyst+ |

TC-009 покрывает CRUD.

TODO (Wave 1): импорт CSV активов, привязка к CMDB.
