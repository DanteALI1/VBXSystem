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
   docs/
   ```
2. PostgreSQL + Redis в Compose; API и Web поднимаются одной командой.
3. Alembic: users, roles, permissions, role_permissions, audit_log (минимально).
4. Seed: `super_admin` (credentials в `.env.example`).
5. Design system: CSS variables, typography, Button/Input/Badge/Card/Table primitives в стиле cvefeed dark.
6. App shell layout (sidebar/topnav) с placeholder routes.
7. `/api/health`, `/api/ready`.
8. README: local run instructions.

## Explicitly out of scope
NVD/BDU sync, Search UI, Tickets, Integrations forms, CVEQL.

## DoD
- [ ] `docker compose up` поднимает stack
- [ ] Login page shell рендерится (может быть wired к dummy auth)
- [ ] Миграции применяются
- [ ] Unit smoke на health
- [ ] Обновлён `docs/STATUS.md` → W0 done

## Quality bar
Enterprise scaffolding: typed configs, lint, no secrets in git, clear module boundaries.
