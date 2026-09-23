# VBXSystem — Build Status

| Wave | Agent | Status | Notes |
|------|-------|--------|-------|
| W0 | Foundation | DONE | Monorepo, Compose, RBAC seed, login shell |
| W1 | Auth & Users | **DONE** | Register/approval, 2FA, profile, users/groups |
| W2 | Vuln Core (NVD/BDU/KEV) | **NEXT** | Depends on W0 |
| W3 | Search & Detail | pending | Depends on W2 |
| W4 | Dashboard / EPSS / CVEQL | pending | Depends on W2–W3 |
| W5 | XDB Exploits | pending | Depends on W2–W3 |
| W6 | Settings suite | pending | Depends on W1 (+ W2 for Database UI) |
| W7 | Tickets | pending | Depends on W1, W3 |
| W8 | Hardening & E2E | pending | Прогон install.sh на чистой РЕД ОС |

Last updated: 2026-09-23

## W1 acceptance
- Register → pending; login blocked until approve
- Login JWT (+ optional 2FA step)
- Profile edit, password change, TOTP setup/enable/disable
- Users page (super_admin): list/create/approve/reject/disable, local groups, AD sync stub
- Pytest auth flows green
- Docs: `docs/AUTH.md`
