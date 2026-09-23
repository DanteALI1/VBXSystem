# W1 — Auth & Users Agent Prompt

## Mission
Реализовать enterprise-аутентификацию и управление пользователями/группами: login, register+admin approval, профиль, пароль, 2FA TOTP, RBAC enforcement.

## Depends on
W0 complete.

## Read first
`docs/PRODUCT_SPEC.md` §6.1–6.2, §7; референс login: https://cvefeed.io/accounts/login/

## Deliverables
### Auth
- Login (username/email + password) → JWT access + refresh (httpOnly cookie или bearer — выбрать и задокументировать)
- Optional 2FA step (TOTP)
- Register → status `pending` until `super_admin`/`admin` approves
- Change password, forgot-password stub (email send if SMTP configured later)
- Session / device tracking for “new device login” hooks

### Profile (`/settings/profile`)
- ФИО, email, организация, должность, телефон
- Смена пароля
- Enable/disable 2FA (QR + recovery codes) unless forced by policy

### Users (`/settings/users`) — super_admin only
- CRUD/list, approve/reject, disable
- Assign roles
- Local groups CRUD
- AD groups: UI placeholder + API contract for sync (полная LDAP реализация может доехать в W6, но модель Group + source=`local|ad` уже нужна)

### Security middleware
- Permission checks on API
- Frontend route guards

## Out of scope
LDAP bind live sync (W6), SMTP real delivery (W6), full audit UI (W6/W8).

## DoD
- [ ] Нельзя войти без approval
- [ ] 2FA enroll + login path работает
- [ ] Users page скрыта для non-super_admin
- [ ] Pytest на auth flows
- [ ] STATUS.md updated

## Quality bar
No user enumeration leaks where avoidable; password hashing (argon2/bcrypt); rate limit login.
