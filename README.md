# VBXSystem

Локальная enterprise-платформа vulnerability intelligence
(NVD + БДУ ФСТЭК + CISA KEV + EPSS + XDB + заявки).

UI в стилистике [cvefeed.io](https://cvefeed.io/) (тёмная тема, плотные data-views), бренд **VBX**, интерфейс на русском.

```
                    ┌─────────────┐
   Browser ────────►│  web (Next) │
                    └──────┬──────┘
                           │ /api/*
                    ┌──────▼──────┐
                    │  api (Fast) │◄── worker (sync jobs)
                    └──┬───────┬──┘
              ┌────────▼─┐  ┌──▼─────┐
              │ Postgres │  │ Redis  │
              └──────────┘  └────────┘
```

## Быстрый старт (Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

Откройте http://localhost/login (`VBX_HTTP_PORT`, по умолчанию 80).  
Супер-админ: `VBX_ADMIN_*` из `.env`.

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/ready
bash deploy/redos/validate-install.sh
```

## Скриншоты UI

### Auth

| Login | Register |
|-------|----------|
| ![Login](docs/screenshots/01_login.png) | ![Register](docs/screenshots/02_register.png) |

### Основные разделы

| Dashboard | Search |
|-----------|--------|
| ![Dashboard](docs/screenshots/03_dashboard.png) | ![Search](docs/screenshots/04_search.png) |

| CVE detail + Scoring | BDU detail |
|----------------------|------------|
| ![CVE](docs/screenshots/05_cve_detail.png) | ![BDU](docs/screenshots/06_bdu_detail.png) |

![Vulnerability Scoring Details](docs/screenshots/05b_cve_scoring_details.png)

| CVEQL | EPSS |
|-------|------|
| ![CVEQL](docs/screenshots/07_cveql.png) | ![EPSS](docs/screenshots/08_epss.png) |

| Exploits (XDB) | Заявки |
|----------------|--------|
| ![XDB](docs/screenshots/09_xdb.png) | ![Tickets](docs/screenshots/10_tickets.png) |

### Настройки

| Профиль | Пользователи |
|---------|--------------|
| ![Profile](docs/screenshots/11_settings_profile.png) | ![Users](docs/screenshots/12_settings_users.png) |

| Уведомления | Безопасность |
|-------------|--------------|
| ![Notifications](docs/screenshots/13_settings_notifications.png) | ![Security](docs/screenshots/14_settings_security.png) |

| База данных (NVD/BDU) | Интеграции |
|-----------------------|------------|
| ![Database](docs/screenshots/15_settings_database.png) | ![Integrations](docs/screenshots/16_settings_integrations.png) |

![API keys](docs/screenshots/17_settings_api_keys.png)

| Брендинг | Система |
|----------|---------|
| ![Branding](docs/screenshots/18_settings_branding.png) | ![System](docs/screenshots/19_settings_system.png) |

| Локальная запись | CVE NVD/БДУ tabs |
|------------------|------------------|
| ![Local](docs/screenshots/20_local_detail.png) | *(см. CVE detail)* |

Карточка CVE включает блок **Vulnerability Scoring Details** (как на cvefeed): score/severity, remotely exploitable, вектор, radar метрик и разбор AV/AC/PR/UI/S/C/I/A.  
W9 добавил login split-layout, брендинг, метрики хоста, локальные ID `VBX-YYYY-NNNN`, sync БДУ по URL.

## Установка на РЕД ОС (minimal)

```bash
cp deploy/redos/vbx.conf.example /root/vbx.conf
sudo bash deploy/redos/install.sh /root/vbx.conf
sudo less /opt/vbx/VBX_INSTALL_INFO.txt
```

Документация оператора:

| Документ | Содержание |
|----------|------------|
| [INSTALL_REDOS.md](docs/ops/INSTALL_REDOS.md) | Установка с нуля |
| [BACKUP.md](docs/ops/BACKUP.md) | `scripts/backup.sh` / `restore.sh` |
| [UPGRADE.md](docs/ops/UPGRADE.md) | Обновление релиза |
| [SECURITY_CHECKLIST.md](docs/ops/SECURITY_CHECKLIST.md) | Hardening |
| [USER_GUIDE_RU.md](docs/ops/USER_GUIDE_RU.md) | Краткая инструкция пользователя |
| [PERFORMANCE.md](docs/ops/PERFORMANCE.md) | Индексы и ориентиры |

## Структура

```
apps/api           FastAPI + Alembic + RBAC seed
apps/web           Next.js (App Router), UI в стилистике cvefeed
deploy/redos       установщик РЕД ОС + validate-install.sh
scripts/           backup / restore
docs/              спецификация, волны, ops
docs/screenshots/  галерея UI
e2e/               Playwright
```

## Тесты

```bash
cd apps/api && pip install -r requirements.txt && pytest -q
npm install && npx playwright install chromium && npm run test:e2e
```

## Статус

Волны **W0–W8** закрыты; **W9** (обогащение из VULNEX) — DONE.  
План W10–W11: [docs/ENRICHMENT_FROM_VULNEX.md](docs/ENRICHMENT_FROM_VULNEX.md) · статус [docs/STATUS.md](docs/STATUS.md).
