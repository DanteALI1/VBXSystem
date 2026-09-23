# Установка с нуля

Инструкция для локального/lab контура VBX (vuln-mgmt). Production hardening — в [ops/runbook.md](../ops/runbook.md).

## Требования

| Компонент | Версия |
|-----------|--------|
| Node.js | по `.nvmrc` (рекомендуется nvm/fnm) |
| pnpm | 9+ (через corepack) |
| Docker + Compose | для Postgres и Redis |
| Git | клон репозитория |

Опционально для сканов: `nmap`, `nuclei` в PATH на машине worker.

## 1. Клон и зависимости

```bash
git clone <repo-url> vbx
cd vbx
corepack enable
pnpm install
```

## 2. Переменные окружения

```bash
cp .env.example .env
# отредактируйте .env — см. configuration.md
```

Минимум: `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.

> Не коммитьте `.env`. Секреты не хранить в docs/journal.

## 3. Инфраструктура

```bash
docker compose up -d postgres redis
# дождитесь healthy
docker compose ps
```

Ожидаемые сервисы: PostgreSQL `:5432`, Redis `:6379`.

## 4. Миграции и seed

```bash
pnpm db:migrate    # drizzle-kit migrate / push — TODO точное имя скрипта Wave 1
pnpm db:seed       # демо-данные без секретов продакшена
```

Seed создаёт: примеры assets, allowlist lab-диапазон, базовые теги. Пользователей — через bootstrap.

## 5. Bootstrap администратора

```bash
pnpm bootstrap:admin
```

Подробности: [bootstrap-admin.md](./bootstrap-admin.md).

## 6. Запуск приложения

```bash
# терминал 1 — UI + API
pnpm dev

# терминал 2 — workers
pnpm worker
```

Откройте `http://localhost:3000` (или `BETTER_AUTH_URL`).

## 7. Проверка

1. Логин admin из bootstrap.
2. Dashboard показывает счётчики (могут быть нули).
3. `/vulnerabilities` — пустой каталог до первой sync.
4. (Опционально) Admin → Sync NVD/BDU enqueue.

## Типовой docker compose (ориентир)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vbx
      POSTGRES_PASSWORD: vbx
      POSTGRES_DB: vbx
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
```

Файл `docker-compose.yml` в корне появится/финализируется в Wave 0–1 foundation.

## Offline / air-gapped

1. Подготовьте mirror npm или vendor `node_modules` архив.
2. БДУ — только через upload XML (см. workers).
3. NVD — выгрузка CVE JSON offline + import job (TODO Wave 2).

## Обновление

```bash
git pull
pnpm install
pnpm db:migrate
pnpm build && pnpm start   # prod mode
# перезапуск workers
```

## Связанные документы

- [configuration.md](./configuration.md)
- [../setup-walkthrough/README.md](../setup-walkthrough/README.md)
