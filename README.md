# VBXSystem

Локальная enterprise-платформа vulnerability intelligence
(NVD + БДУ ФСТЭК + CISA KEV + EPSS + XDB + заявки).

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
                    ▲
              uploads volume (BDU XML)
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
apps/api      FastAPI + Alembic + RBAC seed
apps/web      Next.js (App Router), UI в стилистике cvefeed
packages/     shared contracts
deploy/redos  установщик РЕД ОС + validate-install.sh
scripts/      backup / restore
docs/         спецификация, волны, ops
e2e/          Playwright (smoke + модули)
```

## Тесты

```bash
# API
cd apps/api && pip install -r requirements.txt && pytest -q

# E2E (стек уже поднят)
npm install && npx playwright install chromium
npm run test:e2e
```

## Статус

Все волны **W0–W8** закрыты — см. [docs/STATUS.md](docs/STATUS.md).
