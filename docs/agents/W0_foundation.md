# W0 — Foundation Agent Prompt

## Mission
Создать каркас enterprise-приложения VBXSystem: монорепо, Docker, design tokens (cvefeed-inspired dark), базовый app shell, модели User/Role/Permission, healthchecks. **Без** полноценного NVD sync и Search.

## Read first
- `docs/MASTER_PROMPT.md`
- `docs/PRODUCT_SPEC.md`
- `docs/STATUS.md`

## Deliverables
1. Структура репозитория:
   ```
   apps/web          # Next.js
   apps/api          # FastAPI
   packages/shared   # optional shared types
   docker-compose.yml
   deploy/redos/     # уже есть install.sh — совместимость обязательна
   docs/
   ```
2. PostgreSQL + Redis + API + Web (+ worker stub) в Compose; подъём одной командой.
3. **Совместимость с РЕД ОС installer:**
   - сохранить имена сервисов/`VBX_*` env из `deploy/redos/vbx.conf.example` и bootstrap `.env`;
   - заменить bootstrap stub на боевые Dockerfile’ы, не ломая `deploy/redos/install.sh`;
   - seed admin читает `VBX_ADMIN_*` из env.
4. Alembic: users, roles, permissions, role_permissions, audit_log (минимально).
5. Seed: `super_admin` из env (см. install conf).
6. Design system: CSS variables, typography, Button/Input/Badge/Card/Table primitives в стиле cvefeed dark.
7. App shell layout (sidebar/topnav) с placeholder routes.
8. `/api/health`, `/api/ready`.
9. README + ссылка на `docs/ops/INSTALL_REDOS.md`.

## Explicitly out of scope
NVD/BDU sync, Search UI, Tickets, Integrations forms, CVEQL.

## DoD
- [ ] `docker compose up` поднимает stack
- [ ] `deploy/redos/install.sh` остаётся валидным путём установки (env contract)
- [ ] Login page shell рендерится (может быть wired к dummy auth)
- [ ] Миграции применяются
- [ ] Unit smoke на health
- [ ] Обновлён `docs/STATUS.md` → W0 done

## Quality bar
Enterprise scaffolding: typed configs, lint, no secrets in git, clear module boundaries.
Целевой runtime: Docker на РЕД ОС minimal.
