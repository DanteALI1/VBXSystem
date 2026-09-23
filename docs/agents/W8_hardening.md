# W8 — Hardening, Docs, E2E Agent Prompt

## Mission
Довести продукт до enterprise-ready: безопасность, наблюдаемость, бэкапы, документация оператора, полный E2E smoke, deploy guide.

## Depends on
W0–W7 merged (или максимум доступного; закрыть gaps явно).

## Deliverables
1. Security review checklist + fixes (headers, CSRF/cookie, rate limits, file upload limits for BDU)
2. Backup/restore scripts (Postgres + uploads)
3. Ops docs: `docs/ops/INSTALL_REDOS.md` (актуализировать), `UPGRADE.md`, `BACKUP.md`
4. Прогон / доводка `deploy/redos/install.sh` на чистой **РЕД ОС minimal** (от нуля до отчёта)
5. User docs: short RU guide (login, search, tickets, settings)
6. Playwright E2E suite: login → search → CVE detail → create ticket → admin sync page
7. Performance notes / indexes verification
8. Final `README.md` + architecture diagram
9. Mark all waves done in `STATUS.md`

## DoD
- [ ] E2E green in CI
- [ ] Установка «с нуля» на РЕД ОС через `install.sh` документирована и проверена
- [ ] `VBX_INSTALL_INFO.txt` содержит URL, admin, секреты, команды
- [ ] No known critical security issues in checklist
- [ ] Product exit criteria from MASTER_PROMPT §6 checked

## Quality bar
This wave does not add features; it makes the system shippable on bare Red OS.
