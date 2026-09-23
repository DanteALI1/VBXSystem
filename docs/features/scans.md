# Сканирование (Scans)

Контролируемое обнаружение сервисов и уязвимостей на **разрешённых** целях.

## Политика безопасности (обязательная)

1. **Allowlist-only.** Цель `ScanJob.targets[]` должна попадать в enabled `AllowlistTarget` (CIDR или URL/hostname). Иначе job **не** запускает внешние инструменты: HTTP `400` с кодом `ALLOWLIST_REJECTED`, audit-строка `ScanJob.status=failed` (TC-011). Worker повторно проверяет allowlist перед `adapter.start`.
2. **Detect-only nuclei.** Разрешены только детектирующие templates из каталогов **`cves/`** и **`vulnerabilities/`** относительно `SCAN_NUCLEI_TEMPLATES_DIR` (env `SCAN_NUCLEI_ALLOWED_PATHS`).
3. **Запрет auto-exploitation.** Запрещены intrusive/exploit/rce/dos/brute tags и path escape (`../`, absolute `-t`). Адаптер **не** передаёт exploit-ориентированные флаги nuclei. Цель продукта — detection & inventory, не offensive exploitation.
4. Нет internet-wide / «сканировать всё». Массовые CIDR только если явно в allowlist и согласованы оператором.

## Allowlist

CRUD `AllowlistTarget`: `pattern`, `patternType` (`cidr`|`url`), `enabled`, `description`.

- Matcher: `@/lib/allowlist/matcher` → `targetsAllowed`.
- Gate: `@/lib/scans/allowlist-gate` → `assertTargetsAllowed`.
- Роли: чтение viewer+; запись admin (TC-010).

Примеры lab: `10.0.0.0/8`, `127.0.0.1/32`, `lab.example.local` (url).

## Адаптеры

Интерфейс `ScannerAdapter` (`src/lib/scans/types.ts`):

- `start(job)` → пишет raw report под `storage/reports/{jobId}/`
- `parse(report)` → `FindingDraft[]`

| type | Класс | Поведение |
|------|-------|-----------|
| `nmap` | `NmapAdapter` | XML → Service upsert (+ CVE soft-map из script output) |
| `nuclei` | `NucleiAdapter` | JSONL → Finding + vulnerability link по CVE |
| `zap` | `ZapAdapter` | **stub** → `SCANNER_NOT_IMPLEMENTED` |
| `openvas` | `OpenvasAdapter` | **stub** → `SCANNER_NOT_IMPLEMENTED` |

Запуск: `child_process.execFile` с argv (без shell). Если бинарь отсутствует **или** `SCAN_ADAPTER_MODE=fixture` — используется фикстура из `tests/fixtures/` (см. ниже). Docker exec опционален через override `SCAN_NMAP_BIN` / `SCAN_NUCLEI_BIN`.

## Режим fixture (CI / без бинарей)

```bash
SCAN_ADAPTER_MODE=fixture   # всегда фикстуры
SCAN_ADAPTER_MODE=auto      # default: fixture если nmap/nuclei нет в PATH
SCAN_ADAPTER_MODE=binary    # требовать бинарь (fail если нет)
```

Фикстуры:

- `tests/fixtures/nmap-sample.xml` (порты 22, 80 на 10.0.0.5) — TC-012
- `tests/fixtures/nuclei-sample.jsonl` (CVE-2024-0001) — TC-013

Raw reports: `storage/reports/{jobId}/nmap.xml` или `nuclei.jsonl` (gitignore).

## Создание job

1. UI `/app/scans` или `POST /api/scans` (analyst+): `type`, `target`/`targets`, `options`.
2. Prefetch allowlist + nuclei template validate.
3. Insert `ScanJob` (`queued`) + BullMQ enqueue `scan` (HTTP **только** enqueue — бинарь не в API-процессе).
4. Worker: allowlist re-check → `running` → `adapter.start` → ingest → `succeeded` | `failed`.

Статусы: `queued` → `running` → `succeeded` | `failed`.

## Nuclei: ограничения параметров

```text
ALLOWED: templates under cves/, vulnerabilities/
DENIED:  absolute paths, ../ escape, exploits/, intrusive|dos|exploit|rce|brute tags
DENIED:  auto-exploitation flags (not passed by adapter)
```

Env:

- `SCAN_NUCLEI_ALLOWED_PATHS=cves,vulnerabilities`
- `SCAN_NUCLEI_TEMPLATES_DIR=/opt/nuclei-templates`
- `SCAN_REPORTS_DIR` (default `storage/reports`)

## UI

- Список jobs: status, type, targets, error, created.
- «New scan» — analyst+.
- Viewer: только просмотр.

## Связанные документы

- [ADR-003](../decisions/ADR-003-scan-adapters.md)
- [workers.md](../architecture/workers.md)
- [findings.md](./findings.md)
