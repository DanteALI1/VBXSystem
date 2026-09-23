# W6 — Settings Suite Agent Prompt

## Mission
Закрыть оставшиеся разделы Settings: Уведомления, Безопасность, Интеграции, API keys; довести Users/Profile/Database до production-ready UX.

## Depends on
W1 (auth/users/profile). Database UI из W2 — интегрировать/полировать. AD/SMTP требуют backend connectors.

## Read first
`docs/PRODUCT_SPEC.md` §6 полностью; макет БД в `docs/references/`.

## Deliverables
### Notifications `/settings/notifications`
- In-app toasts/modals toggles:
  - Новые уязвимости
  - Обновления CISA KEV
  - Синхронизация NVD
  - (optional) BDU import / ticket events
- Per-user preferences stored

### Security `/settings/security` (admin)
- Force 2FA for all
- New device login alerts
- API client certificate auth (mTLS) — enable + upload CA / instructions
- Audit log viewer (filter by user/action/date)

### Integrations `/settings/integrations`
- SMTP / Exchange test-send
- LDAP/AD: connection test, base DN, group sync job, map groups→roles
- SSO OIDC/SAML config + test login (staging flag)

### API keys `/settings/api-keys`
- Create (scopes, expiry), show secret once, revoke, list last used

### Polish
- Settings nav IA consistent
- Validation + RU error messages
- Permission gates per section

## Out of scope
Rewriting vuln sync (W2); tickets (W7).

## DoD
- [ ] Каждый settings subsection usable end-to-end
- [ ] LDAP group sync creates/updates groups
- [ ] SMTP test works with mailhog in compose (dev)
- [ ] API key can call a protected read endpoint
- [ ] Audit entries for admin actions
- [ ] STATUS.md updated

## Quality bar
Secrets encrypted; integration tests with testcontainers/mailhog; no plaintext passwords in logs.
