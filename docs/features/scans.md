# Сканы

Маршрут: `/app/scans`

## Контракт

Таблица `scan_jobs`:

- `type`: `nmap` | `nuclei` | `zap` | `openvas`
- `status`: `queued` → `running` → `succeeded` | `failed`
- `target`, `options_json`, timestamps, `error`, `created_by`

## Flow

1. UI/API: создать job + проверить allowlist (`lib/domain/allowlist.ts`).
2. App **только enqueue** в очередь `scan` (не запускает бинарь).
3. Worker: адаптер → `storage/reports/<jobId>/` → parse → findings/services.
4. UI показывает статус и ссылку на результаты.

TODO: UI placeholder; processors/adapters — TODO (ADR-003).

## Reject вне allowlist

Если `isTargetAllowed(target, rules) === false` → HTTP 4xx, job не создаётся / не ставится в очередь (TC-011).

## Типы сканеров (Wave план)

| Type | Приоритет | Фикстура |
|------|-----------|----------|
| nmap | P0 | `tests/fixtures/nmap/` |
| nuclei | P0 | `tests/fixtures/nuclei/` |
| zap | later | TODO |
| openvas | later | TODO |

## Тесты

- TC-011, TC-012, TC-013, TC-015 (enqueue)
