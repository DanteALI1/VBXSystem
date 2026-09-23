# RESULTS — журнал прогонов

| Run ID | Date (UTC) | Env | Scope | Pass | Fail | Skip | Branch | Notes |
|--------|------------|-----|-------|------|------|------|--------|-------|
| W0-UNIT-001 | 2026-09-23 05:47 | node20 / vitest | unit | 11 | 0 | 0 | cursor/wave0-foundation-88b7 | severity, allowlist, advanced-query |
| W1-UNIT-001 | 2026-09-23 06:10 | node20 / vitest | unit | 16 | 0 | 0 | cursor/wave1-auth-shell-vulns-88b7 | + extended parser cases |
| W1-E2E-001 | 2026-09-23 06:11 | playwright chromium | e2e login+vulns | 7 | 0 | 0 | cursor/wave1-auth-shell-vulns-88b7 | TC-001 + catalog/detail |
| W2-INT-001 | 2026-09-23 06:25 | vitest+postgres_test | integration sync/assets | 12 | 0 | 0 | cursor/wave2-sync-assets-88b7 | mocked NVD/BDU; TC-005…010 |
| W1-SCR-001 | 2026-09-23 06:13 | screenshots | A2 B1 B2 C3 C4 C5 F2 | — | — | — | cursor/wave1-auth-shell-vulns-88b7 | docs/setup-walkthrough/images |

## Детализация по кейсам (последний прогон)

| TC | Status | Type | Duration | Run ID | Evidence / log |
|----|--------|------|----------|--------|----------------|
| TC-001 | pass | e2e | ~2s | W1-E2E-001 | tests/e2e/login.spec.ts |
| TC-002 | draft | e2e | | | Wave 2 (sync RBAC) |
| TC-003 | pass | e2e | ~4s | W1-E2E-001 | tests/e2e/vulnerabilities.spec.ts |
| TC-004 | pass | e2e | ~4s | W1-E2E-001 | detail sections |
| TC-005 | pass | integration | | | Wave 2 |
| TC-006 | pass | integration | | | Wave 2 |
| TC-007 | automated | integration | PASS | fixtures/mocks | Wave 2 BDU |
| TC-008 | automated | integration | PASS | fixtures/mocks | Wave 2 BDU |
| TC-009 | pass | integration | | | Wave 2 |
| TC-010 | pass | integration | | | Wave 2 |
| TC-011 | draft | integration | | | Wave 3 |
| TC-012 | draft | integration | | | Wave 3 |
| TC-013 | draft | integration | | | Wave 3 |
| TC-014 | draft | e2e | | | Wave 3 |
| TC-015 | draft | integration | | | Wave 2 |
| TC-016 | pass | manual/e2e | | W2-INT-001 | 2026-09-23 06:25 | vitest+postgres_test | integration sync/assets | 12 | 0 | 0 | cursor/wave2-sync-assets-88b7 | mocked NVD/BDU; TC-005…010 |
| W1-SCR-001 | dashboard KPIs screenshot + summary API |
| TC-017 | draft | e2e | | | Wave 3 |
| TC-018 | draft | e2e | | | API+UI present; expand automation Wave 2 |
| TC-019 | draft | e2e | | | tag UI on detail; filter facet present |
| TC-020 | pass | unit | ~4ms | W1-UNIT-001 | tests/unit/advanced-query.test.ts |

Status values: `pass` | `fail` | `skip` | `blocked` | `draft` | `—`
