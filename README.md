# VBXSystem0

Внутренняя MVP-система управления уязвимостями (NVD/BDU sync, assets, allowlist, scans, findings).

## Быстрый старт

```bash
cp .env.example .env
# локально: DATABASE_URL/REDIS_URL → localhost

docker compose up -d postgres redis
npm install
npm run db:migrate
npm run bootstrap:admin
npm run seed:vulns          # опционально
npm run seed:assets         # lab hosts; allowlist создать в UI (CIDR 10.0.0.0/8)
npm run dev                 # http://localhost:3000
```

Worker (отдельный процесс — sync и очередь сканов):

```bash
npm run worker
```

Smoke (fixture, без внешних API/бинарей):

```bash
npm run smoke:sync          # нужен worker
# allowlist 10.0.0.0/8 enabled, затем:
npm run smoke:scan          # inline nmap fixture, worker не обязателен
```

Полный стек Docker Compose:

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
| `npm run worker` | BullMQ worker (nvd/bdu/scan) |
| `npm run smoke:sync` | Fixture NVD+BDU enqueue + wait |
| `npm run smoke:scan` | Inline nmap fixture scan |
| `npm run db:generate` | Генерация миграций Drizzle |
| `npm run db:migrate` | Применение миграций |
| `npm run bootstrap:admin` | Первый admin |
| `npm run seed:vulns` / `seed:assets` | Демо-данные |
