# WAVE-01 — Gate checklist

Критерии приёмки Wave 1 / Auth + vuln list-detail P0 e2e.

## Gate (orchestrator)

- [ ] код волны соответствует контрактам (auth, RBAC, vuln list/detail)
- [ ] typecheck PASS
- [ ] lint PASS
- [ ] unit PASS (regression)
- [ ] e2e P0 PASS — TC-001, TC-003, TC-004 (`npm run test:e2e` exit 0)
- [ ] TC-002 deferred / out of scope (viewer sync — Wave 2)
- [ ] UI smoke: login, `/app/vulnerabilities`, detail with CVE+BDU
- [ ] docs волны обновлены (TESTPLAN, RESULTS, TC status)
- [ ] TC Last run заполнены
- [ ] RESULTS.md Wave 1 section appended
- [ ] скрины волны (Screenshots agent) — отдельный трек
- [ ] PROGRESS.md = PASS
- [ ] commit + push
- [ ] нет открытых P0 по Wave 1 scope

## QA / Tests subagent (done)

- [x] Automate TC-001 (`tests/e2e/login.spec.ts`)
- [x] Automate TC-003 (`tests/e2e/vulnerabilities-filters.spec.ts`)
- [x] Automate TC-004 (`tests/e2e/vulnerability-detail.spec.ts`)
- [x] Auth helper + Playwright setup storageState
- [x] `npm run test:e2e` PASS (exit 0, 8 tests)
- [x] TC case files Status / Last run / Automation updated
- [x] RESULTS.md Wave 1 entry
- [x] TESTPLAN.md automation table updated

## Notes

- Better Auth sign-in rate-limit under `next start`: 3 / 10s — mitigated by shared `playwright/.auth/admin.json` + retry in `loginAsAdmin`.
- Minimal `data-testid` added on login + vuln filters/table/detail.
- Commit/push: orchestrator (QA subagent instructed not to commit).
