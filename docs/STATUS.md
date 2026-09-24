# VBXSystem — Build Status

| Wave | Agent | Status | Notes |
|------|-------|--------|-------|
| W0 | Foundation | DONE | Monorepo, Compose, RBAC seed |
| W1 | Auth & Users | DONE | Register/approval, 2FA, users |
| W2 | Vuln Core (NVD/BDU/KEV) | DONE | Sync jobs + Settings/Database UI |
| W3 | Search & Detail | DONE | Search + CVE/BDU cards, KEV highlight |
| W4 | Dashboard / EPSS / CVEQL | DONE | KPI dashboard, EPSS, CVEQL subset |
| W5 | XDB Exploits | DONE | Metadata catalog + CSV/JSON import |
| W6 | Settings suite | DONE | Notifications, Security, Integrations, API keys |
| W7 | Tickets | **DONE** | Internal vuln queue + workflow |
| W8 | Hardening & E2E | pending | Прогон install.sh на чистой РЕД ОС |

Last updated: 2026-09-24

## W7 acceptance
- Models: tickets, ticket_comments, ticket_events, ticket_attachments (+ alembic `0006_tickets`)
- API: list/filter, create (CVE/BDU), status transitions, assign (manage), comments, timeline
- UI: `/tickets`, `/tickets/[id]`; create from CVE/BDU (`?cve=` / `?bdu=`)
- RBAC: viewer read-limited; analyst write; ticket_manager/admin assign/close
- Duplicate open-ticket warning; audit on create/status/assign
- Pytest `tests/test_tickets.py`
