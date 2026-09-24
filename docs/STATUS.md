# VBXSystem — Build Status

| Wave | Agent | Status | Notes |
|------|-------|--------|-------|
| W0 | Foundation | DONE | Monorepo, Compose, RBAC seed |
| W1 | Auth & Users | DONE | Register/approval, 2FA, users |
| W2 | Vuln Core (NVD/BDU/KEV) | DONE | Sync jobs + Settings/Database UI |
| W3 | Search & Detail | DONE | Search + CVE/BDU cards, KEV highlight |
| W4 | Dashboard / EPSS / CVEQL | DONE | KPI dashboard, EPSS, CVEQL subset |
| W5 | XDB Exploits | DONE | Metadata catalog + CSV/JSON import |
| W6 | Settings suite | **DONE** | Notifications, Security, Integrations, API keys |
| W7 | Tickets | pending | Depends on W1, W3 |
| W8 | Hardening & E2E | pending | Прогон install.sh на чистой РЕД ОС |

Last updated: 2026-09-24

## W6 acceptance
- `/settings/notifications` — per-user prefs
- `/settings/security` — force 2FA, device alerts, mTLS CA/docs, audit viewer
- `/settings/integrations` — SMTP (MailHog), LDAP mock sync→groups, SSO config
- `/settings/api-keys` — create/revoke; Bearer/`X-API-Key` auth for `vuln:read`
- Secrets encrypted at rest; audit on admin actions
- Pytest `tests/test_settings_suite.py`; MailHog service in compose

## W5 acceptance
- Model `exploits` + alembic `0004_xdb`
- `GET /xdb` — search/filters, import JSON/CSV/sample
- CVE detail `exploits[]`; UI `/xdb`
- Pytest `tests/test_xdb.py`
