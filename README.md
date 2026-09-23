# VBX (vuln-mgmt)

Онprem-платформа управления уязвимостями: каталог CVE/БДУ, активы, allowlist-сканирование и findings.

**Продукт:** VBX / пакет `vuln-mgmt`. Это не OpenCVE и не использует бренд OpenCVE.

## Быстрый старт

```bash
pnpm install
cp .env.example .env   # заполнить DATABASE_URL, REDIS_URL, Better Auth, bootstrap
docker compose up -d postgres redis
pnpm db:migrate && pnpm db:seed
pnpm dev               # UI+API
pnpm worker            # sync/scan workers (отдельный терминал)
```

Логин bootstrap (после Wave 1): `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` из `.env`.

Подробности: [docs/setup/install.md](./docs/setup/install.md).

## Документация

Полное оглавление: **[docs/README.md](./docs/README.md)**.

Ключевые разделы:

- [Архитектура](./docs/architecture/overview.md)
- [Конфигурация](./docs/setup/configuration.md)
- [Роли](./docs/features/auth-roles.md)
- [ADR-004 UX-референс и лицензия](./docs/decisions/ADR-004-opencve-ux-reference.md)
- [Тест-план TC-001…020](./docs/testing/TESTPLAN.md)

## Стек (кратко)

Next.js 15 · Better Auth · PostgreSQL/Drizzle · BullMQ/Redis · Vitest/Playwright — см. [ADR-001](./docs/decisions/ADR-001-stack.md).
