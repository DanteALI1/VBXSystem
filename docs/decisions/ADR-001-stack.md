# ADR-001: Стек

## Статус

Accepted (Wave 0)

## Контекст

Нужен внутренний MVP vuln DB: UI, синхронизация NVD/BDU, сканы, RBAC, очередь фоновых задач.

## Решение

| Слой | Выбор |
|------|--------|
| UI / API | Next.js 16 App Router |
| ORM / SQL | Drizzle + PostgreSQL 15 |
| Auth | Better Auth (email/password) |
| Очереди | BullMQ + Redis 7 |
| Валидация | Zod |
| Тесты | Vitest (unit/integration), Playwright (e2e) |
| UI kit | shadcn / Base UI primitives |

Долгая работа (sync, scan) — только в worker-процессе.

## Последствия

- Два процесса в проде: `app` + `worker`.
- Compose покрывает локальный/стендовый запуск.
- Схема auth совмещена с доменной в одном `db/schema.ts`.
