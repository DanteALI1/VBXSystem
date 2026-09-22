# WAVE-01 — Gate checklist

Критерии приёмки Wave 1 / Auth + shell + vulns.

## Gate

- [x] код волны соответствует контрактам (auth, RBAC, vuln list/detail)
- [x] typecheck PASS
- [x] lint PASS
- [x] unit PASS (regression, 14)
- [x] e2e P0 PASS — TC-001, TC-003, TC-004 (`npm run test:e2e` exit 0, 8 tests)
- [x] TC-002 deferred / out of scope (viewer sync — Wave 2)
- [x] UI smoke: login, `/app/vulnerabilities`, detail with CVE+BDU
- [x] docs волны обновлены (TESTPLAN, RESULTS, TC status)
- [x] TC Last run заполнены
- [x] RESULTS.md Wave 1 section appended
- [x] скрины волны: A2, B1, B2, C3, C4, F2 captured
- [x] PROGRESS.md = PASS
- [x] commit + push
- [x] нет открытых P0 по Wave 1 scope

## Notes

- Better Auth sign-in rate-limit under `next start`: 3 / 10s — mitigated by shared `playwright/.auth/admin.json`.
- `proxy.ts` is Next.js 16 replacement for middleware.
