# Сканирование (Scans)

Контролируемое обнаружение сервисов и уязвимостей на **разрешённых** целях.

## Политика безопасности (обязательная)

1. **Allowlist-only.** Цель `ScanJob.target` должна попадать в enabled `AllowlistTarget` (IP, CIDR или hostname). Иначе job не запускает внешние инструменты: статус `failed`, код `ALLOWLIST_REJECTED` (TC-011).
2. **Detect-only nuclei.** Разрешены только детектирующие templates из каталогов **`cves/`** и **`vulnerabilities/`** относительно `SCAN_NUCLEI_TEMPLATES_DIR`.
3. **Запрет auto-exploitation.** Запрещены intrusive/exploit templates, произвольные пути `-t`, теги вроде `intrusive`, `dos` (точный deny-list в адаптере — ADR-003). Цель продукта — detection & inventory, не offensive exploitation.
4. Нет internet-wide / «сканировать всё». Массовые CIDR только если явно в allowlist и согласованы оператором.

## Allowlist

CRUD `AllowlistTarget`: `cidrOrHost`, `label`, `enabled`, `notes`.

- Роли: чтение analyst+ (viewer — read-only список без возможности править); запись admin (или analyst+ по политике Wave 1 — зафиксировать admin для mutate).
- TC-010.

Примеры записей lab: `127.0.0.1`, `10.0.0.0/8`, `lab.example.local`.

## Типы ScanJob

| type | Инструмент | Результат |
|------|------------|-----------|
| `nmap` | nmap | Services + базовые evidence |
| `nuclei` | nuclei | Findings, CVE map из template |

### Создание job

1. UI/API: target, type, params (ports / templates subset).
2. Prefetch allowlist check.
3. Enqueue `scan:jobs`.
4. Worker пишет артефакт → `scan:ingest` → БД.

Статусы: `queued` → `running` → `succeeded` | `failed` | `cancelled`.

## Nuclei: ограничения параметров

```text
ALLOWED: templates under cves/, vulnerabilities/
DENIED:  network flood, exploit, takeovers с destructive matchers — по deny-list
DENIED:  user-supplied absolute paths вне SCAN_NUCLEI_TEMPLATES_DIR
```

Env: `SCAN_NUCLEI_ALLOWED_PATHS=cves,vulnerabilities`.

## Фикстуры для тестов

- TC-012: nmap XML fixture → services/findings без реального nmap.
- TC-013: nuclei JSONL fixture → findings.

В CI бинарь может отсутствовать — используется режим `SCAN_ADAPTER_MODE=fixture` (TODO Wave 1).

## UI

- Список jobs: status, target, type, requestedBy, timestamps, error.
- Кнопка «New scan» — analyst+.
- Viewer: только просмотр.

## Связанные документы

- [ADR-003](../decisions/ADR-003-scan-adapters.md)
- [workers.md](../architecture/workers.md)
- [findings.md](./findings.md)
