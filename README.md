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

## Видео-превью UI

Короткий тур (~30 с): login → dashboard → search → CVE → local ID → branding → system → database → tickets → XDB.

![VBXSystem UI preview](docs/demo/ui-preview.gif)

MP4 (полное качество): [docs/demo/ui-preview.mp4](docs/demo/ui-preview.mp4) · постер: [docs/demo/ui-preview-poster.png](docs/demo/ui-preview-poster.png)

> На GitHub GIF встраивается прямо в README; MP4 открывается по ссылке (или через raw URL после merge).
## Скриншоты UI

Актуальная галерея (переснята после W9). Старые файлы удалены.

### Auth

| Login | Register |
|-------|----------|
| ![Login](docs/screenshots/01_login.png) | ![Register](docs/screenshots/02_register.png) |

### Основные разделы

| Dashboard | Search |
|-----------|--------|
| ![Dashboard](docs/screenshots/03_dashboard.png) | ![Search](docs/screenshots/04_search.png) |

| CVE detail | BDU detail |
|------------|------------|
| ![CVE](docs/screenshots/05_cve_detail.png) | ![BDU](docs/screenshots/06_bdu_detail.png) |

| Vulnerability Scoring Details | CVE · вкладка БДУ |
|-------------------------------|-------------------|
| ![Scoring](docs/screenshots/05b_cve_scoring_details.png) | ![BDU tab](docs/screenshots/05c_cve_bdu_tab.png) |

| CVEQL | EPSS |
|-------|------|
| ![CVEQL](docs/screenshots/07_cveql.png) | ![EPSS](docs/screenshots/08_epss.png) |

| Exploits (XDB) | Заявки |
|----------------|--------|
| ![XDB](docs/screenshots/09_xdb.png) | ![Tickets](docs/screenshots/10_tickets.png) |

| Локальная запись |
|------------------|
| ![Local](docs/screenshots/20_local_detail.png) |

### Настройки

| Профиль | Пользователи |
|---------|--------------|
| ![Profile](docs/screenshots/11_settings_profile.png) | ![Users](docs/screenshots/12_settings_users.png) |

| Уведомления | Безопасность |
|-------------|--------------|
| ![Notifications](docs/screenshots/13_settings_notifications.png) | ![Security](docs/screenshots/14_settings_security.png) |

| Брендинг | База данных (NVD/BDU URL) |
|----------|--------------------------|
| ![Branding](docs/screenshots/18_settings_branding.png) | ![Database](docs/screenshots/15_settings_database.png) |

| Система | Интеграции |
|---------|------------|
| ![System](docs/screenshots/19_settings_system.png) | ![Integrations](docs/screenshots/16_settings_integrations.png) |

| API keys |
|----------|
| ![API keys](docs/screenshots/17_settings_api_keys.png) |

Карточка CVE: **Vulnerability Scoring Details** + вкладки описания **NVD | БДУ**.  
W9: login split-layout, брендинг, метрики хоста, локальные ID `VBX-YYYY-NNNN`, sync БДУ по URL.

## Установка на РЕД ОС (minimal)

Интерактивный мастер (спрашивает креды по этапам, пароль Admin генерирует сам):

```bash
sudo bash deploy/redos/install.sh
```

Или из conf-файла:

```bash
cp deploy/redos/vbx.conf.example /root/vbx.conf
sudo bash deploy/redos/install.sh /root/vbx.conf
sudo less /opt/vbx/VBX_INSTALL_INFO.txt
```

В конце установщик печатает URL, логин Admin и **сгенерированный пароль**, плюс пишет отчёт mode 600.  
Подробности: [docs/ops/INSTALL_REDOS.md](docs/ops/INSTALL_REDOS.md).

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
docs/screenshots/  галерея UI (актуальные PNG)
docs/demo/         видео-превью (GIF + MP4)
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
