AUTH
=====

Bearer JWT (Authorization: Bearer <access_token>).
Refresh token возвращается при login и хранится на клиенте (localStorage в W1).
HttpOnly cookies — кандидат на W8 hardening.

Flows
-----
- POST /auth/register → status=pending
- POST /auth/login → tokens | {requires_2fa, temp_token}
- POST /auth/login/2fa → tokens
- Profile: GET/PATCH /profile, POST /profile/change-password
- 2FA: POST /auth/2fa/setup|enable|disable
- Users (super_admin): /users, approve/reject, groups, /groups/ad/sync (stub W6)
