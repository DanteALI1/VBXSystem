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
| W7 | Tickets | DONE | Internal vuln queue + workflow |
| W8 | Hardening & E2E | DONE | Headers, upload limits, backup/ops docs, smoke E2E |
| W9 | VULNEX UI & Ops enrich | **DONE** | Login split, branding, system metrics, local IDs, BDU URL, NVD/BDU tabs |
| W10 | Setup wizard | PENDING | First-run wizard (no license) |
| W11 | Notify & SLA | PENDING | Telegram + ticket SLA |

Last updated: 2026-09-24

## W9 acceptance (VULNEX enrichment)
- Docs: `ENRICHMENT_FROM_VULNEX.md`, agents W9–W11, AGENT_LAUNCH prompts
- Login: two-column brand panel + form; public `GET /branding`
- Settings → Брендинг / Система (psutil metrics)
- Local vulns `VBX-YYYY-NNNN` + Search + `/local/new` + detail
- CVE detail: NVD | БДУ description tabs; richer BDU field grid
- Database: BDU XML URL save + sync-by-URL
- Migration `0007_local_vulns`; pytest `test_w9_enrichment.py`
- `scripts/fix-docker-bridge.sh` for bridge hairpin on cloud VMs

## W8 acceptance
- Security headers middleware + optional `VBX_TRUSTED_HOSTS`; CORS methods/headers narrowed
- BDU/XDB upload size limits + rate limits; path traversal reject on BDU filenames
- `scripts/backup.sh` / `restore.sh`; docs: BACKUP, UPGRADE, SECURITY_CHECKLIST, USER_GUIDE_RU, PERFORMANCE
- `deploy/redos/validate-install.sh`; INSTALL_REDOS актуализирован (чистая РЕД ОС VM — процедура §2–3 + validate)
- Playwright `e2e/smoke.spec.ts` + CI workflow `.github/workflows/e2e.yml`
- README + architecture diagram; STATUS all waves DONE
- Product exit criteria MASTER_PROMPT §6 — checked in W8 DoD

## W7 acceptance
- Models: tickets, ticket_comments, ticket_events, ticket_attachments (+ alembic `0006_tickets`)
- API: list/filter, create (CVE/BDU), status transitions, assign (manage), comments, timeline
- UI: `/tickets`, `/tickets/[id]`; create from CVE/BDU (`?cve=` / `?bdu=`)
- RBAC: viewer read-limited; analyst write; ticket_manager/admin assign/close
- Duplicate open-ticket warning; audit on create/status/assign
- Pytest `tests/test_tickets.py`
