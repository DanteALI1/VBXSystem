# Security checklist — VBXSystem (W8)

Статус на момент hardening-волны. Auth — Bearer JWT / X-API-Key в localStorage (не cookie-session).

| # | Контроль | Статус | Примечание |
|---|----------|--------|------------|
| 1 | CORS allowlist из env | OK | `VBX_CORS_ORIGINS`; методы/заголовки сужены |
| 2 | Security headers | OK | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` |
| 3 | Trusted hosts (opt-in) | OK | `VBX_TRUSTED_HOSTS` — пусто = все; в prod задать host |
| 4 | Rate limit login/register/forgot | OK | Redis fixed-window, fail-open |
| 5 | Rate limit CVEQL / uploads | OK | CVEQL per-user; BDU/XDB upload limits |
| 6 | Upload size limits | OK | BDU 64 MiB, XDB 32 MiB, global body `VBX_MAX_UPLOAD_BYTES` |
| 7 | Path traversal на BDU filename | OK | basename + reject `..` / separators |
| 8 | CSRF (cookie session) | N/A | Нет cookie-session; Bearer header |
| 9 | Secrets в `.env` mode 600 | OK | install.sh + VBX_INSTALL_INFO.txt |
| 10 | Postgres/Redis пароли | OK | генерируются install.sh |
| 11 | 2FA / force-2fa | OK | Settings → Security |
| 12 | Audit log чувствительных действий | OK | sync, upload, tickets, keys |
| 13 | RBAC на admin/sync | OK | permissions seed |
| 14 | Default admin password | WARN | Сменить после первого входа (документровано) |
| 15 | TLS termination | WARN | HTTP по умолчанию; HTTPS через reverse-proxy / VBX_SCHEME |
| 16 | API :8000 наружу | WARN | На prod закрыть firewall до API, оставить только web |

## Рекомендации оператору

1. Сменить `VBX_ADMIN_PASSWORD` после установки.
2. Выставить `VBX_TRUSTED_HOSTS=<dns>,localhost` и `VBX_CORS_ORIGINS` только на публичный URL.
3. Не публиковать порт 8000 наружу; nginx/compose web → api внутри сети.
4. Регулярный `scripts/backup.sh` (cron), хранить бэкапы вне сервера приложения.
5. NVD API key — только в Settings UI или env, не в git.
