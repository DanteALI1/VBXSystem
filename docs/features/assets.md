# Активы (assets) и allowlist

Маршруты UI:

- список: `/app/assets`
- деталь: `/app/assets/[id]`
- allowlist: `/app/settings/allowlist`

Код: `lib/assets/*`, `lib/allowlist/*`, `app/api/assets/**`, `app/api/allowlist/**`.  
RBAC: [auth-roles](auth-roles.md).

## Модель

Таблица `assets`: `hostname`, `ip` (IPv4), `description` (nullable).  
Связанные `services` (`asset_id` ON DELETE CASCADE): `port`, `protocol`, `name`, `product`, `version`.  
`findings.asset_id` также CASCADE при удалении актива.

Сервисы появляются из сканов (nmap и др., Wave 3). На detail page список `services[]` отдаётся уже сейчас (часто пустой до сканов).

---

## RBAC

| Операция | viewer | analyst | admin |
|----------|--------|---------|-------|
| Read list / detail (`GET /api/assets`, `GET /api/assets/:id`) | ✓ | ✓ | ✓ |
| Create / Update / Delete assets | ✗ | ✓ (`canManageAssets`) | ✓ |
| Read allowlist | ✓ | ✓ | ✓ |
| Create / Update / Delete allowlist | ✗ | ✗ | ✓ (`canManageAllowlist`) |

Реализация: `requireApiSession` + `requireApiRole(session, ["admin","analyst"])` на мутациях assets; allowlist write — только `["admin"]`.

---

## Assets API

| Method | Path | Роли | Notes |
|--------|------|------|-------|
| GET | `/api/assets` | any auth | `?q=&page=&pageSize=` → `{ items, total, page, pageSize }` |
| POST | `/api/assets` | analyst+ | body → `201` asset |
| GET | `/api/assets/:id` | any auth | asset + `services[]`; `404` если нет |
| PATCH | `/api/assets/:id` | analyst+ | partial update; `404` |
| DELETE | `/api/assets/:id` | analyst+ | `204`; cascade services/findings |

### Query list

| Param | Default | Ограничения |
|-------|---------|-------------|
| `q` | — | `ilike` по hostname, ip, description |
| `page` | 1 | ≥ 1 |
| `pageSize` | 25 | 1…100 |

Сортировка: `created_at DESC`.

### Body create

```json
{
  "hostname": "web-01.lab.local",
  "ip": "10.0.1.10",
  "description": "optional"
}
```

Validation (`lib/assets/schemas.ts`):

- `hostname` — DNS labels (regex, max 253);
- `ip` — `z.ipv4`;
- `description` — trim, max 2000, empty → `null`.

Ошибки Zod → `400 { error: "Validation failed", details }`.

### Body patch

Хотя бы одно поле: `hostname?`, `ip?`, `description?` (null/empty очищает description).

### JSON shape

**List item / create / patch response:**

```json
{
  "id": "uuid",
  "hostname": "web-01.lab.local",
  "ip": "10.0.1.10",
  "description": "…",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**Detail** добавляет:

```json
{
  "services": [
    {
      "id": "uuid",
      "port": 443,
      "protocol": "tcp",
      "name": "https",
      "product": "nginx",
      "version": "1.24",
      "createdAt": "ISO-8601"
    }
  ]
}
```

Порядок services: по `port` ASC.

---

## Allowlist API

Allowlist ограничивает **цели сканирования** (gate при создании scan job, Wave 3), не заменяет реестр активов.

| Method | Path | Роли |
|--------|------|------|
| GET | `/api/allowlist` | any auth |
| POST | `/api/allowlist` | admin |
| PATCH | `/api/allowlist/:id` | admin |
| DELETE | `/api/allowlist/:id` | admin |

### List

`?page=&pageSize=` (default pageSize **50**, max 100) → `{ items, total, page, pageSize }`, order `created_at DESC`. Отдельного `q` нет.

### Body create

```json
{
  "pattern": "10.0.0.0/8",
  "type": "cidr",
  "enabled": true,
  "description": "lab"
}
```

| Поле | Правила |
|------|---------|
| `type` | `"cidr"` \| `"url"` |
| `pattern` | CIDR: `z.cidrv4` (напр. `10.0.0.0/8`); URL: full URL, `host[:port][/path]`, или `*.host` (совместимо с `matchUrl`) |
| `enabled` | default `true` |
| `description` | optional, max 2000 |

PATCH: хотя бы одно поле; если меняются `type`/`pattern` по отдельности — пара валидируется после merge с существующей строкой (`validateAllowlistPattern` в route).

JSON item: `{ id, pattern, type, enabled, description, createdAt, updatedAt }`.

Disabled rules **не** участвуют в `listEnabledAllowlistRules` / `isTargetAllowed` (TC-011).

Доменный матчер: `lib/domain/allowlist.ts`.

---

## Seed

```bash
npm run seed:assets
```

Upsert по hostname трёх lab-хостов (`web-01`, `db-01`, `scanner` в `10.0.1.0/24` / `10.0.2.5`). См. `scripts/seed-assets.ts`.

Для каталога уязвимостей (Wave 1): `npm run seed:vulns`.

---

## UI

- Список: поиск `q`, пагинация, кнопки create/edit/delete для analyst+.
- Detail: карточка актива + таблица services (пусто до Wave 3 сканов).
- Allowlist settings: CRUD только для admin; viewer/analyst read-only.

---

## Тесты

| TC | Файл / заметка |
|----|----------------|
| TC-009 | `tests/integration/assets-crud.test.ts` |
| TC-010 | `tests/integration/allowlist-crud.test.ts` |
| TC-011 | allowlist gate сканов (Wave 3) — unit уже есть |
| TC-012 | nmap → services на asset (Wave 3) |
