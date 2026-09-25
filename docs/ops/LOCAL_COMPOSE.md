# Локальный Compose — для коллеги с git pull

Пошаговый запуск после клонирования репозитория (Windows / Linux / macOS с Docker).

## Требования

- Docker Desktop / Docker Engine + Compose v2
- ~4 GB RAM под контейнеры (Postgres держит полный NVD зеркало тяжелее)
- Свободные порты: `80` (UI), `8000` (API), опционально `8025` (MailHog)

## 1. Клон и env

```bash
git clone <url> VBXSystem
cd VBXSystem
cp .env.example .env
```

Отредактируйте минимум:

| Переменная | Зачем |
|------------|--------|
| `VBX_SECRET_KEY` | JWT; смените с дефолта |
| `VBX_POSTGRES_PASSWORD` / `VBX_REDIS_PASSWORD` | пароли сервисов |
| `VBX_ADMIN_PASSWORD` | первый вход |
| `VBX_MODULE_TOKEN` | общий токен scanner-sidecar (обязателен, если поднимаете сканеры) |
| `VBX_NVD_API_KEY` | опционально; без ключа NVD sync медленнее / rate-limit |

Оставьте `VBX_PROFILE=dev` для локалки (EPSS mock). Для live EPSS: `VBX_PROFILE=prod` или `VBX_EPSS_MOCK=false`.

> `.env` **не коммитится**. После `git pull` сохраняйте свой `.env`; сверяйте новые ключи с `.env.example`.

## 2. Поднять стек (ядро)

```bash
docker compose up -d --build
```

Сервисы:

| Сервис | Роль |
|--------|------|
| `postgres` / `redis` | данные / очередь |
| `api` | FastAPI; **Alembic upgrade head** + seed при старте |
| `worker` | sync NVD/KEV/EPSS (`VBX_WORKER_MODE=sync`) |
| `ops-worker` | schedules, alert outbox, risk backfill / acceptance reopen (`VBX_WORKER_MODE=ops`) |
| `web` | Next.js UI |
| `mailhog` | локальная SMTP-ловушка |

Проверка:

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/login
docker compose exec api alembic current
# ожидается head: 0024_rbac_reports (или новее)
```

UI: http://localhost/login — логин/пароль из `VBX_ADMIN_*`.

### После `git pull` (уже есть volume)

```bash
git pull
# при необходимости: diff .env.example .env
docker compose up -d --build api worker ops-worker web
```

Миграции применятся entrypoint’ом API. Не удаляйте volumes без бэкапа.

## 3. Сканеры (опционально)

Отдельный файл `docker-compose.scanners.yml` + профили:

```bash
# один модуль
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile nmap up -d --build

# несколько
docker compose -f docker-compose.yml -f docker-compose.scanners.yml \
  --profile nmap --profile nuclei --profile gowitness --profile discovery up -d --build
```

Профили: `nmap` | `shodan` | `zap` | `nuclei` | `gowitness` | `discovery`.

- Токен: `VBX_MODULE_TOKEN` должен совпадать у API и sidecar.
- Allowlist: `VBX_SCAN_ALLOWLIST` (см. `.env.example`).
- Discovery mock: `VBX_DISCOVERY_MOCK=true`.
- Подробности: [modules/README.md](../../modules/README.md).

## 4. Wave 2 (risk / alerts / reports / RBAC / graph)

После подъёма API (миграции `0022`–`0024`) доступны:

| UI | API |
|----|-----|
| Находки — risk/priority/SLA/acceptance | `PATCH /findings/{id}`, `POST /findings/recompute-risk` |
| Настройки → Алерты | `/alert-policies`, `/alerts/outbox`, `/settings/jira` |
| Проекты / Отчёты / Шаблоны | `/projects`, `/reports/executive`, `/report-templates` |
| Граф | `GET /graph/attack-path?asset_id=` |
| Настройки → Орг. единицы | `/org-units`, `PUT /users/{id}/org-units` |

PDF executive требует weasyprint в образе API (по умолчанию **не** установлен) — используйте `format=html` или поставьте weasyprint + системные deps в кастомном Dockerfile.

Старые findings с `risk_score=0` добирает `ops-worker` (backfill) или вручную:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/findings/recompute-risk?limit=500"
```

## 5. Данные (после первого входа)

В **Настройки → База данных**:

1. NVD sync (полный каталог ~1–3 ч с API key)
2. KEV sync
3. BDU sync by URL
4. EPSS sync (при `VBX_PROFILE=prod` или `VBX_EPSS_MOCK=false` — live CSV)

KPI «CVE сегодня» считает записи с `published_at` **сегодня по NVD**, не «сколько скачали».

## 6. Dashboard шаблоны

- Системные: VBX Classic / Analyst / Ops / Compact
- Редактировать → DnD → **Сохранить как…**
- **Добавить представление…** — каталог виджетов

## 7. Тесты (без Docker UI)

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
# узко Wave 2:
pytest tests/test_wave2.py -q
```

E2E (корень репо):

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

## Частые проблемы

| Симптом | Что сделать |
|---------|-------------|
| `web` unhealthy / порт 80 занят | смените `VBX_HTTP_PORT` в `.env` |
| `ready` database false | дождитесь healthy postgres; `docker compose logs api` |
| Migration error | только API entrypoint гоняет Alembic; смотрите `logs api` |
| Worker / ops на старом коде | `docker compose up -d --build worker ops-worker` |
| Risk везде 0 | дождитесь ops-worker tick или `POST /findings/recompute-risk` |
| PDF 501 | нормально без weasyprint — качайте HTML |
| Scanner 401 | `VBX_MODULE_TOKEN` разный у api и sidecar; rebuild обоих |
| Пустой EPSS | mock при `dev`; либо sync EPSS, либо `VBX_PROFILE=prod` |
| Cookies / logout | `VBX_AUTH_COOKIES=true` + rebuild api+web |

## Чеклист «у коллеги после pull»

1. `cp .env.example .env` (или merge новых ключей)
2. `docker compose up -d --build`
3. `curl` health/ready + login в UI
4. `docker compose exec api alembic current` → head
5. (опц.) scanners compose + profile
6. (опц.) NVD/KEV sync в Settings

## Не коммитить

- `.env`, пароли, `node_modules/`, `.venv/`, локальные volume данные
