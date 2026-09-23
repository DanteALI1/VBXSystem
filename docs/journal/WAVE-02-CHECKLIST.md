# WAVE-02 CHECKLIST — Sync + Assets/Allowlist

## Implementation

- [x] NVD sync worker + idempotent upsert
- [x] NVD rate-limit backoff
- [x] BDU XML parse + CVE link
- [x] BDU upload fallback
- [x] Sync settings enqueue (UI/API)
- [x] Assets CRUD + detail
- [x] Allowlist CRUD

## Tests

- [x] TC-005
- [x] TC-006
- [x] TC-007
- [x] TC-008
- [x] TC-009
- [x] TC-010
- [x] typecheck/lint/unit/integration PASS

## Docs / Screens

- [x] Walkthrough B3,C1,C2,D1,D2,D3
- [x] PROGRESS.md Wave 2 PASS

## Gate

- [x] Orchestrator Result = **PASS**
- [ ] commit + push
