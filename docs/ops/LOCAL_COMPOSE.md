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
| `VBX_NVD_API_KEY` | опционально; без ключа NVD sync медленнее / rate-limit |

Оставьте `VBX_PROFILE=dev` для локалки (EPSS mock). Для live EPSS: `VBX_PROFILE=prod` или `VBX_EPSS_MOCK=false`.

## 2. Поднять стек

```bash
docker compose up -d --build
```

Сервисы: `postgres`, `redis`, `api`, `worker`, `web`, `mailhog`.  
API при старте прогоняет Alembic до head и seed (admin, RBAC, системные dashboard-шаблоны).

Проверка:

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/login
```

UI: http://localhost/login — логин/пароль из `VBX_ADMIN_*`.

## 3. Данные (после первого входа)

В **Настройки → База данных**:

1. NVD sync (полный каталог ~1–3 ч с API key)
2. KEV sync
3. BDU sync by URL
4. EPSS sync (при `VBX_PROFILE=prod` или `VBX_EPSS_MOCK=false` — live CSV)

KPI «CVE сегодня» считает записи с `published_at` **сегодня по NVD**, не «сколько скачали». Объём каталога — виджет **«Объём каталога»**.

## 4. Dashboard шаблоны

- Системные: VBX Classic / Analyst / Ops / Compact
- Редактировать → DnD → **Сохранить как…** (в т.ч. с Classic)
- **Добавить представление…** — каталог готовых виджетов с превью

## 5. Тесты (без Docker UI)

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
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
| `ready` database false | дождитесь healthy postgres; смотрите `docker compose logs api` |
| Migration error | `docker compose logs api` — Alembic только в api entrypoint |
| Worker на старом коде | `docker compose up -d --build worker` |
| Пустой EPSS | mock при `dev`; либо sync EPSS в Settings, либо `VBX_PROFILE=prod` |
| Cookies / logout | по умолчанию Bearer+localStorage; `VBX_AUTH_COOKIES=true` + rebuild api+web |

## Не коммитить

- `.env`, пароли, `node_modules/`, `.venv/`, локальные volume данные
