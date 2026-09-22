# Активы (assets)

Маршрут: `/app/assets`

## Контракт

Таблица `assets`: `hostname`, `ip`, `description`. Связанные `services` (port/protocol/product/version) появляются из сканов (nmap и др.).

## CRUD (план)

| Операция | Роли | Примечание |
|----------|------|-----------|
| Create | admin, analyst | валидация IP/hostname |
| Read list/detail | все авторизованные | |
| Update | admin, analyst | |
| Delete | admin | cascade → services, findings |

TODO: UI Wave 0 — placeholder; API CRUD — TODO (TC-009).

## Allowlist vs assets

Allowlist (`allowlist_targets`) ограничивает **цели сканирования**, не заменяет реестр активов. Актив может существовать вне allowlist; скан по цели вне allowlist — reject (TC-011).

## Тесты

- TC-009 assets CRUD
- TC-012 nmap → services на asset
