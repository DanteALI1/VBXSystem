# VBXSystem0

Внутренняя MVP-система управления уязвимостями (Wave 0 scaffold).

## Быстрый старт

```bash
cp .env.example .env
# для локальной разработки DATABASE_URL/REDIS_URL уже указывают на localhost

docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```

Worker (отдельный процесс):

```bash
npm run worker
```

Полный стек через Docker Compose:

```bash
docker compose up --build
```

## Документация

См. [docs/README.md](docs/README.md).

## Скрипты

| Script | Описание |
|--------|----------|
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run test:unit` | Unit-тесты (vitest) |
| `npm run test:integration` | Integration-тесты |
| `npm run test:e2e` | Playwright e2e |
| `npm run worker` | BullMQ worker stub |
| `npm run db:generate` | Генерация миграций Drizzle |
| `npm run db:migrate` | Применение миграций |
