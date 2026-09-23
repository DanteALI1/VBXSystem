# TESTPLAN — TC-001…020

Покрытие foundation-требований. Приоритет P0 обязателен для gate соответствующей волны.

| ID | Title | Type | Priority | Module | Wave (цель) | Automation |
|----|-------|------|----------|--------|-------------|------------|
| TC-001 | Login success/fail | e2e | P0 | auth | 1 | `tests/e2e/login.spec.ts` |
| TC-002 | Viewer cannot trigger sync | integration/e2e | P0 | auth/sync | 1 | `tests/integration/rbac-sync.test.ts` |
| TC-003 | Vulnerabilities filters/search + advanced | e2e | P0 | vulnerabilities | 1–2 | `tests/e2e/vulnerabilities-search.spec.ts` |
| TC-004 | Vulnerability detail CVE/BDU fields | e2e | P0 | vulnerabilities | 1–2 | `tests/e2e/vulnerability-detail.spec.ts` |
| TC-005 | NVD upsert idempotent | integration | P0 | workers/nvd | 2 | `tests/integration/nvd-upsert.test.ts` |
| TC-006 | NVD rate-limit backoff (mock) | unit/integration | P0 | workers/nvd | 2 | `tests/unit/nvd-backoff.test.ts` |
| TC-007 | BDU XML parse + CVE link | integration | P0 | workers/bdu | 2 | `tests/integration/bdu-parse.test.ts` |
| TC-008 | BDU upload fallback | integration/e2e | P1 | workers/bdu | 2 | `tests/integration/bdu-upload.test.ts` |
| TC-009 | Assets CRUD | integration/e2e | P0 | assets | 3 | `tests/e2e/assets.spec.ts` |
| TC-010 | Allowlist CRUD | integration/e2e | P0 | scans | 3 | `tests/e2e/allowlist.spec.ts` |
| TC-011 | Scan rejects outside allowlist | integration | P0 | scans | 3 | `tests/integration/allowlist-reject.test.ts` |
| TC-012 | nmap fixture → services/findings | integration | P0 | scans | 3 | `tests/integration/nmap-ingest.test.ts` |
| TC-013 | nuclei fixture → findings | integration | P0 | scans | 3 | `tests/integration/nuclei-ingest.test.ts` |
| TC-014 | Finding status transition | integration | P0 | findings | 3 | `tests/integration/finding-status.test.ts` |
| TC-015 | Sync settings enqueue jobs | integration | P1 | sync | 2 | `tests/integration/sync-enqueue.test.ts` |
| TC-016 | Dashboard counters | integration/e2e | P1 | dashboard | 2 | `tests/e2e/dashboard.spec.ts` |
| TC-017 | Screenshot walkthrough smoke | manual/e2e | P2 | docs | 3 | `tests/e2e/walkthrough-images.spec.ts` |
| TC-018 | Saved view save/load | e2e | P1 | vulnerabilities | 2 | `tests/e2e/saved-views.spec.ts` |
| TC-019 | Vulnerability tags filter | e2e | P1 | vulnerabilities | 2 | `tests/e2e/vuln-tags.spec.ts` |
| TC-020 | Advanced search parser unit | unit | P0 | search | 1 | `tests/unit/advanced-search-parser.test.ts` |

## Трассировка на требования

- Auth/RBAC → TC-001, TC-002, features/auth-roles
- Catalog UX/search → TC-003, TC-004, TC-018, TC-019, TC-020
- NVD/BDU → TC-005…008, TC-015
- Assets/scans/findings → TC-009…014
- Ops/docs smoke → TC-016, TC-017

## Данные и изоляция

- Отдельная test DB; truncate между integration.
- NVD/BDU HTTP — mock; XML/JSON фикстуры в `tests/fixtures/`.
- Nuclei/nmap — fixture mode, без сети.

## Exit criteria волны

См. `docs/journal/WAVE-0N-CHECKLIST.md`: соответствующие TC в RESULTS = pass (или waived с причиной).
