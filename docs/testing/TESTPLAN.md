# TESTPLAN — волны → покрытие TC

| Волна | Фокус | TC (обязательные) | Примечание |
|-------|-------|-------------------|------------|
| **0 Foundation** | schema, domain, docs, unit smoke | каркас TC-001…017; unit allowlist/severity | Gate: typecheck/lint/unit; e2e N/A |
| **1 Auth + RBAC** | login, roles, bootstrap | TC-001, TC-002 | e2e P0 |
| **2 Vuln sync** | NVD/BDU upsert, rate limit, upload | TC-005, TC-006, TC-007, TC-008, TC-015 | unit/integration |
| **3 Assets + allowlist** | CRUD | TC-009, TC-010 | e2e/integration |
| **4 Scans** | gate + parsers | TC-011, TC-012, TC-013 | unit/integration |
| **5 Findings + dashboard** | status, counters | TC-014, TC-016 | e2e/integration |
| **6 UI polish + evidence** | filters/detail/walkthrough | TC-003, TC-004, TC-017 | e2e + screenshots |

## Приоритеты

- **P0** — блокеры релиза MVP для соответствующей волны.
- **P1** — важно, можно закрыть соседней волной (TC-008, TC-016, TC-017).

## Трассировка Automation (уже есть)

| Область | Файл |
|---------|------|
| Allowlist | `tests/unit/allowlist.test.ts` → TC-011 (частично) |
| Severity | `tests/unit/severity.test.ts` → поддержка TC-003/014 |
