# ADR-001: Стек VBXSystem

- **Status:** Accepted
- **Date:** 2026-03-23
- **Wave:** 0

## Context

Нужен on-prem vuln-mgmt с современным UI, фоновой синхронизацией NVD/BDU и контролируемыми сканами. Команда ориентирована на TypeScript end-to-end.

## Decision

| Слой | Выбор |
|------|--------|
| UI/API | Next.js 15 App Router, React 19 |
| Auth | Better Auth |
| DB | PostgreSQL + Drizzle ORM |
| Queues | BullMQ + Redis |
| Validation | Zod |
| Tables/data | TanStack Table + Query |
| UI | shadcn/ui, Tailwind 4 |
| Tests | Vitest + Playwright |
| Package manager | pnpm |

## Consequences

- Один язык для app и workers (workers могут быть отдельным entrypoint на tsx).
- Операторам нужны Postgres + Redis (+ опционально scanner binaries).
- Не используем Python-монолит «как у OpenCVE» — нет копирования их стека/кода.

## Alternatives considered

- Django/OpenCVE fork — отвергнуто из-за BSL и продуктовых границ (ADR-004).
- Prisma вместо Drizzle — допустимо, выбран Drizzle из package.json foundation.
- GraphQL — избыточно для Wave 0; REST Route Handlers.
