# WAVE-02 CHECKLIST — Sync + Assets/Allowlist

## Implementation

- [x] NVD sync worker + idempotent upsert
- [x] NVD rate-limit backoff
- [x] BDU XML parse + CVE link
- [x] BDU upload fallback
- [x] Sync settings enqueue (UI/API) — NVD + BDU
- [ ] Assets CRUD (merge assets branch)
- [ ] Allowlist CRUD (merge assets branch)

## Tests

- [x] TC-005
- [x] TC-006
- [x] TC-007
- [x] TC-008
- [ ] TC-009
- [ ] TC-010
- [ ] TC-015

## Docs

- [ ] Walkthrough B3,C1,C2,D1,D2,D3
- [ ] PROGRESS.md Wave 2 PASS

## Gate

- [ ] typecheck/lint/integration PASS after full merge
- [ ] Orchestrator Result
