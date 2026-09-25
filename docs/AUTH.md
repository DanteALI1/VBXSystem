AUTH
=====

Bearer JWT (Authorization: Bearer <access_token>).
Refresh token возвращается при login и хранится на клиенте (localStorage в W1).
HttpOnly cookies — `VBX_AUTH_COOKIES=true` через Next BFF.
Если `VBX_AUTH_COOKIES` не задан: при `VBX_PROFILE=prod` cookies включаются по умолчанию; в `dev` — Bearer.
Cookie mode: `SameSite=Lax` + double-submit CSRF (`vbx_csrf` + `X-CSRF-Token`) на mutating BFF routes (refresh/logout).

GET /auth/me (UserOut) includes `permissions: string[]` (super_admin → `["*"]`) for UI gating via `hasPermission(user, "vuln:sync")` etc.

Flows
-----
- POST /auth/register → status=pending
- POST /auth/login → tokens | {requires_2fa, temp_token}
- POST /auth/login/2fa → tokens
- Profile: GET/PATCH /profile, POST /profile/change-password
- 2FA: POST /auth/2fa/setup|enable|disable
- Users (super_admin): /users, approve/reject, groups, /groups/ad/sync (stub W6)

SSO (OIDC)
----------
- GET /auth/sso/status — публичный флаг кнопки на /login
- GET /auth/sso/login?next= — redirect на IdP или staging bounce
- GET /auth/sso/callback — code exchange → JWT / cookies
- Redirect URI (default): `{VBX_PUBLIC_URL}/api/auth/sso/callback` (Next BFF)
- Settings → Integrations: client_id/secret, issuer, scopes, claims→roles, staging
- Staging (`sso_staging=true`): демо-пользователь `sso_demo` без внешнего IdP
- Live: Authorization Code; auto-provision `auth_provider=oidc` + `external_sub`