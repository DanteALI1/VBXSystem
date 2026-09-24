# VBXSystem

**VBXSystem** — on‑prem платформа vulnerability intelligence для команд ИБ:  
единый каталог уязвимостей (NVD + БДУ ФСТЭК + CISA KEV + EPSS + XDB) и внутренняя очередь заявок на обработку.

Интерфейс на русском, тёмная тема в духе [cvefeed.io](https://cvefeed.io/), бренд **VBX**.  
Разворачивается Docker Compose’ом или интерактивным установщиком на **РЕД ОС**.

---

## Что это за система

| Слой | Назначение |
|------|------------|
| **Каталог** | Поиск и карточки CVE / БДУ / локальных записей `VBX-YYYY-NNNN` |
| **Риски** | CVSS, CISA KEV, EPSS, CVEQL, каталог эксплойтов (XDB) |
| **Операции** | Заявки: создание → статус → назначение → комментарии → timeline |
| **Админка** | Пользователи/RBAC, брендинг, sync источников, метрики хоста, API‑ключи |
| **Платформа** | Next.js + FastAPI + Postgres + Redis + worker синхронизации |

```
   Browser ──► web (Next.js) ──/api/*──► api (FastAPI) ◄── worker
                                            │
                                   ┌────────┴────────┐
                                   ▼                 ▼
                               Postgres            Redis
```

**Типичный сценарий:** аналитик находит CVE в Search → открывает карточку → создаёт заявку с severity и описанием → меняет статус, пишет комментарий → админ смотрит sync источников и метрики хоста.

---

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d --build
```

- UI: http://localhost/login (`VBX_HTTP_PORT`, по умолчанию `80`)
- Супер‑админ: `VBX_ADMIN_*` из `.env`

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/ready
bash deploy/redos/validate-install.sh
```

---

## Видео‑превью

Тур по UI (~40 с): login → dashboard (сайдбар) → search → CVE/БДУ → CVEQL/EPSS/XDB → **заявки (создание и заполнение)** → настройки.

![VBXSystem UI preview](docs/demo/ui-preview.gif)

MP4: [docs/demo/ui-preview.mp4](docs/demo/ui-preview.mp4) · постер: [docs/demo/ui-preview-poster.png](docs/demo/ui-preview-poster.png)

---

## Скриншоты UI

Галерея переснята с актуального UI (сворачиваемый сайдбар **без линий и без цветового шва** в развёрнутом и свёрнутом виде).

### Auth

| Login | Register |
|-------|----------|
| ![Login](docs/screenshots/01_login.png) | ![Register](docs/screenshots/02_register.png) |

### Основные разделы

| Dashboard | Sidebar свёрнут |
|-----------|-----------------|
| ![Dashboard](docs/screenshots/03_dashboard.png) | ![Collapsed](docs/screenshots/03b_dashboard_sidebar_collapsed.png) |

| Search | CVE detail |
|--------|------------|
| ![Search](docs/screenshots/04_search.png) | ![CVE](docs/screenshots/05_cve_detail.png) |

| Scoring Details | CVE · вкладка БДУ |
|-----------------|-------------------|
| ![Scoring](docs/screenshots/05b_cve_scoring_details.png) | ![BDU tab](docs/screenshots/05c_cve_bdu_tab.png) |

| BDU detail | CVEQL |
|------------|-------|
| ![BDU](docs/screenshots/06_bdu_detail.png) | ![CVEQL](docs/screenshots/07_cveql.png) |

| EPSS | Exploits (XDB) |
|------|----------------|
| ![EPSS](docs/screenshots/08_epss.png) | ![XDB](docs/screenshots/09_xdb.png) |

| Локальная запись |
|------------------|
| ![Local](docs/screenshots/20_local_detail.png) |

### Заявки — создание и заполнение

| Список | Форма «Новая заявка» |
|--------|----------------------|
| ![Tickets](docs/screenshots/10_tickets.png) | ![Create empty](docs/screenshots/10a_ticket_create_empty.png) |

| Заполненная форма | Карточка заявки |
|-------------------|-----------------|
| ![Create filled](docs/screenshots/10b_ticket_create_filled.png) | ![Detail](docs/screenshots/10c_ticket_detail.png) |

| Статус → in_progress | Комментарий |
|----------------------|-------------|
| ![Status](docs/screenshots/10d_ticket_status_in_progress.png) | ![Comment](docs/screenshots/10e_ticket_with_comment.png) |

| Timeline событий |
|------------------|
| ![Timeline](docs/screenshots/10f_ticket_timeline.png) |

### Настройки

| Профиль | Пользователи |
|---------|--------------|
| ![Profile](docs/screenshots/11_settings_profile.png) | ![Users](docs/screenshots/12_settings_users.png) |

| Уведомления | Безопасность |
|-------------|--------------|
| ![Notifications](docs/screenshots/13_settings_notifications.png) | ![Security](docs/screenshots/14_settings_security.png) |

| Брендинг | База данных (NVD / БДУ URL) |
|----------|----------------------------|
| ![Branding](docs/screenshots/18_settings_branding.png) | ![Database](docs/screenshots/15_settings_database.png) |

| Система | Интеграции |
|---------|------------|
| ![System](docs/screenshots/19_settings_system.png) | ![Integrations](docs/screenshots/16_settings_integrations.png) |

| API keys |
|----------|
| ![API keys](docs/screenshots/17_settings_api_keys.png) |

Пересъём галереи: `npx playwright test e2e/capture-gallery.spec.ts`

---

## Установка на РЕД ОС (minimal)

Интерактивный мастер сам спрашивает креды по этапам (сеть → PostgreSQL → Redis → SECRET_KEY → профиль Admin → доп. УЗ → firewall).  
Пароль **Admin всегда генерируется** в конце и печатается один раз.

```bash
sudo bash deploy/redos/install.sh
```

Или из conf:

```bash
cp deploy/redos/vbx.conf.example /root/vbx.conf
sudo bash deploy/redos/install.sh /root/vbx.conf
sudo less /opt/vbx/VBX_INSTALL_INFO.txt
```

Подробности: [docs/ops/INSTALL_REDOS.md](docs/ops/INSTALL_REDOS.md).

| Документ | Содержание |
|----------|------------|
| [INSTALL_REDOS.md](docs/ops/INSTALL_REDOS.md) | Установка с нуля |
| [BACKUP.md](docs/ops/BACKUP.md) | `scripts/backup.sh` / `restore.sh` |
| [UPGRADE.md](docs/ops/UPGRADE.md) | Обновление релиза |
| [SECURITY_CHECKLIST.md](docs/ops/SECURITY_CHECKLIST.md) | Hardening |
| [USER_GUIDE_RU.md](docs/ops/USER_GUIDE_RU.md) | Краткая инструкция пользователя |
| [PERFORMANCE.md](docs/ops/PERFORMANCE.md) | Индексы и ориентиры |

---

## Структура репозитория

```
apps/api           FastAPI + Alembic + RBAC seed
apps/web           Next.js (App Router), UI в стилистике cvefeed
deploy/redos       установщик РЕД ОС + validate-install.sh
scripts/           backup / restore
docs/screenshots/  галерея UI
docs/demo/         видео-превью (GIF + MP4)
e2e/               Playwright (+ capture-gallery)
```

---

## Тесты

```bash
cd apps/api && pip install -r requirements.txt && pytest -q
npm install && npx playwright install chromium && npm run test:e2e
```

---

## Статус

Волны **W0–W9** закрыты (W9 — обогащение UI/ops из VULNEX).  
План W10–W11: [docs/ENRICHMENT_FROM_VULNEX.md](docs/ENRICHMENT_FROM_VULNEX.md) · [docs/STATUS.md](docs/STATUS.md).
