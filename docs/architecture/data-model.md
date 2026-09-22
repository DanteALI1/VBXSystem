# Модель данных

Источник истины: [`db/schema.ts`](../../db/schema.ts). ORM: Drizzle + PostgreSQL.

## Enums

| Enum (PG) | Значения |
|-----------|----------|
| `user_role` | `admin`, `analyst`, `viewer` |
| `severity` | `critical`, `high`, `medium`, `low`, `info`, `unknown` |
| `vuln_source` | `nvd`, `bdu` |
| `finding_status` | `open`, `fixed`, `accepted`, `false_positive` |
| `scan_type` | `nmap`, `nuclei`, `zap`, `openvas` |
| `scan_status` | `queued`, `running`, `succeeded`, `failed` |
| `allowlist_type` | `cidr`, `url` |
| `sync_status` | `idle`, `running`, `succeeded`, `failed` |

---

## Better Auth + пользователи

### `users`

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | text | PK | ID пользователя |
| `name` | text | not null | Имя |
| `email` | text | not null, unique | Email |
| `email_verified` | boolean | not null, default false | |
| `image` | text | nullable | |
| `role` | `user_role` | not null, default `viewer` | Роль приложения |
| `created_at` | timestamptz | not null, now | |
| `updated_at` | timestamptz | not null, now, onUpdate | |

### `session`

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | text | PK | |
| `expires_at` | timestamptz | not null | |
| `token` | text | not null, unique | |
| `created_at` / `updated_at` | timestamptz | not null | |
| `ip_address` | text | nullable | |
| `user_agent` | text | nullable | |
| `user_id` | text | FK → `users.id` ON DELETE CASCADE | |

**Индексы:** `session_user_id_idx` (`user_id`).

### `account`

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | text | PK | |
| `account_id` | text | not null | |
| `provider_id` | text | not null | |
| `user_id` | text | FK → `users.id` CASCADE | |
| `access_token` / `refresh_token` / `id_token` | text | nullable | |
| `access_token_expires_at` / `refresh_token_expires_at` | timestamptz | nullable | |
| `scope` | text | nullable | |
| `password` | text | nullable | credential provider |
| `created_at` / `updated_at` | timestamptz | not null | |

**Индексы:** `account_user_id_idx` (`user_id`).

### `verification`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | text | PK |
| `identifier` | text | not null |
| `value` | text | not null |
| `expires_at` | timestamptz | not null |
| `created_at` / `updated_at` | timestamptz | not null |

**Индексы:** `verification_identifier_idx` (`identifier`).

---

## Домен

### `assets`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK, defaultRandom |
| `hostname` | text | not null |
| `ip` | text | not null |
| `description` | text | nullable |
| `created_at` / `updated_at` | timestamptz | not null |

**Индексы:** `assets_ip_idx`, `assets_hostname_idx`.

### `services`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `asset_id` | uuid | FK → `assets.id` CASCADE, not null |
| `port` | integer | not null |
| `protocol` | text | not null |
| `name` / `product` / `version` | text | nullable |
| `created_at` | timestamptz | not null |

### `vulnerabilities`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `cve_id` | text | nullable, **unique** |
| `bdu_id` | text | nullable, **unique** |
| `title` | text | not null |
| `description` | text | nullable |
| `severity` | `severity` | not null, default `unknown` |
| `cvss_score` | numeric(3,1) | nullable |
| `published_at` / `modified_at` | timestamptz | nullable |
| `created_at` / `updated_at` | timestamptz | not null |

**Индексы:**

- unique: `vulnerabilities_cve_id_uidx`, `vulnerabilities_bdu_id_uidx`
- btree: `vulnerabilities_cve_id_idx`, `vulnerabilities_bdu_id_idx`, `vulnerabilities_severity_idx`

Upsert NVD/BDU опирается на уникальность `cve_id` / `bdu_id`.

### `vulnerability_sources`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `vulnerability_id` | uuid | FK → `vulnerabilities.id` CASCADE |
| `source` | `vuln_source` | not null (`nvd` \| `bdu`) |
| `raw_json` | text | nullable (NVD payload) |
| `raw_xml` | text | nullable (фрагмент BDU) |
| `external_url` | text | nullable |
| `synced_at` | timestamptz | not null, default now |

### `scan_jobs`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `type` | `scan_type` | not null |
| `status` | `scan_status` | not null, default `queued` |
| `target` | text | not null |
| `options_json` | jsonb | nullable |
| `started_at` / `finished_at` | timestamptz | nullable |
| `error` | text | nullable |
| `created_by` | text | FK → `users.id` SET NULL |
| `created_at` | timestamptz | not null |

### `findings`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `vulnerability_id` | uuid | FK → `vulnerabilities` SET NULL |
| `asset_id` | uuid | FK → `assets` CASCADE, not null |
| `service_id` | uuid | FK → `services` SET NULL |
| `scan_job_id` | uuid | FK → `scan_jobs` SET NULL |
| `title` | text | not null |
| `description` | text | nullable |
| `severity` | `severity` | not null, default `unknown` |
| `status` | `finding_status` | not null, default `open` |
| `cve_id` | text | nullable (денормализация) |
| `created_at` / `updated_at` | timestamptz | not null |

**Индексы:** `findings_status_idx` (`status`).

### `sync_states`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `source` | `vuln_source` | not null, **unique** |
| `last_sync_at` / `last_success_at` | timestamptz | nullable |
| `cursor` | text | nullable (NVD pagination) |
| `token` | text | nullable |
| `file_hash` | text | nullable (BDU XML hash) |
| `meta_json` | jsonb | nullable |
| `status` | `sync_status` | not null, default `idle` |

**Индексы:** unique `sync_states_source_uidx` (`source`) — одна строка на источник.

### `allowlist_targets`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | uuid | PK |
| `pattern` | text | not null |
| `type` | `allowlist_type` | not null (`cidr` \| `url`) |
| `enabled` | boolean | not null, default true |
| `description` | text | nullable |
| `created_at` / `updated_at` | timestamptz | not null |

Логика матчинга: [`lib/domain/allowlist.ts`](../../lib/domain/allowlist.ts).

---

## Relations (Drizzle)

```
users ──< session
users ──< account
users ──< scan_jobs (created_by)

assets ──< services
assets ──< findings

vulnerabilities ──< vulnerability_sources
vulnerabilities ──< findings

services ──< findings
scan_jobs ──< findings
```

`verification` и `sync_states` / `allowlist_targets` — без Drizzle `relations()` в Wave 0 (таблицы есть).

## Доменные хелперы (не таблицы)

- Severity: [`lib/domain/severity.ts`](../../lib/domain/severity.ts) — `parseSeverity`, `compareSeverity`, `isAtLeast`
- Allowlist: [`lib/domain/allowlist.ts`](../../lib/domain/allowlist.ts) — `matchCidr`, `matchUrl`, `isTargetAllowed`
