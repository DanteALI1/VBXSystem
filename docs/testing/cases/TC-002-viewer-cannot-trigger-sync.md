# TC-002 Viewer cannot trigger sync

Status: automated  
Type: integration  
Priority: P0  
Module: auth-roles / sync

## Preconditions

- Mock session via `tests/helpers/session.ts` (viewer / analyst / admin).
- Endpoints: `POST /api/sync/nvd`, `POST /api/sync/bdu` (`canTriggerSync` = **admin only**).

## Steps

1. Call sync APIs with mocked `viewer` session.
2. Call sync APIs with mocked `analyst` session.
3. Call sync APIs with mocked `admin` session (positive control).

## Expected

- Viewer: API `403`; no successful enqueue from that call.
- Analyst: API `403` (matches [auth-roles.md](../../features/auth-roles.md) — sync is admin-only, not analyst).
- Admin: `202` + `jobId`.

## Automation

Integration: `tests/integration/sync-enqueue.test.ts` (describe `TC-002`).  
Session helper: `tests/helpers/session.ts`.  
E2E with real viewer user: deferred (signup disabled; mock session covers RBAC).

## Last run

datetime: 2026-09-22 23:33 UTC  
command: `npm run test:integration`  
result: PASS  
evidence: 9 tests in sync-enqueue (incl. 3 TC-002), suite exit 0

## Notes

Матрица: [auth-roles.md](../../features/auth-roles.md).  
TC draft mentioned analyst success — **corrected** to admin-only per `canTriggerSync`.
