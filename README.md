# VBXSystem

Локальная enterprise-платформа vulnerability intelligence (NVD + БДУ ФСТЭК + CISA KEV + EPSS + XDB + заявки).

## Быстрый старт (Docker)

```bash
cp .env.example .env
# при необходимости отредактируйте пароли/админа
docker compose up -d --build
```

Откройте http://localhost/login (порт задаётся `VBX_HTTP_PORT`, по умолчанию 80).

Учётка супер-админа берётся из `.env` (`VBX_ADMIN_*`).

Проверка API:

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/ready
```

## Установка на РЕД ОС (minimal)

На «голом» сервере:

```bash
cp deploy/redos/vbx.conf.example /root/vbx.conf
# подставьте host, admin, пароли
sudo bash deploy/redos/install.sh /root/vbx.conf
sudo less /opt/vbx/VBX_INSTALL_INFO.txt
```

Подробности: [docs/ops/INSTALL_REDOS.md](docs/ops/INSTALL_REDOS.md).

## Структура

```
apps/api     FastAPI + Alembic + RBAC seed
apps/web     Next.js (App Router), тёмный UI в стилистике cvefeed
packages/    shared contracts
deploy/redos установщик РЕД ОС
docs/        спецификация и промпты волн
```

## Статус разработки

См. [docs/STATUS.md](docs/STATUS.md). Оркестрация: [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md).

## Dev без Docker (API unit)

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```
