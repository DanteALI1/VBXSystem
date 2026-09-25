# Обновление VBXSystem

## Подготовка

1. Сделайте бэкап: `scripts/backup.sh` (см. [BACKUP.md](BACKUP.md)).
2. Сохраните `/opt/vbx/config/vbx.env` и `VBX_INSTALL_INFO.txt`.
3. Запланируйте окно обслуживания (синхронизации NVD/KEV прервутся).

## Путь обновления (Docker Compose)

```bash
cd /opt/vbx/app   # или каталог клона репо
# сохранить .env — не перезаписывать секреты
git pull
# сверьте новые ключи: diff .env.example .env

docker compose --env-file .env up -d --build
# обязательно пересобрать api + worker + ops-worker + web
```

Миграции Alembic выполняются entrypoint API при старте (Wave 2: `0022`–`0024`). Проверка:

```bash
docker compose --env-file .env exec api alembic current
# ожидается 0024_rbac_reports (или новее)
curl -fsS http://127.0.0.1:8000/ready
docker compose --env-file .env ps
```

Если используете сканеры — после pull пересоберите и их:

```bash
docker compose -f docker-compose.yml -f docker-compose.scanners.yml \
  --profile nmap --profile discovery up -d --build
```

После миграции risk: `ops-worker` сам досчитает `risk_score` для старых findings (backfill), либо:

`POST /findings/recompute-risk?limit=500`

## Через install.sh

Повторный запуск установщика безопасен для секретов, если вы передаёте тот же conf / используете уже сгенерированный `.env`:

```bash
sudo bash /opt/vbx/app/deploy/redos/install.sh /opt/vbx/config/vbx.conf.used
```

Скрипт перезапишет дерево приложения, но `generate_secrets_and_env` не должен затирать существующие пароли, если они уже в conf. При сомнении — бэкап `.env` вручную.

## Откат

1. `docker compose down`
2. Вернуть предыдущий код / образ.
3. `scripts/restore.sh <каталог-бэкапа>`
4. `docker compose up -d`

## Совместимость

| Изменение | Действие |
|-----------|----------|
| Новые alembic-ревизии | автоматический upgrade при старте API |
| Breaking env | см. changelog релиза; дополните `.env` |
| Смена major Postgres | отдельный dump/restore цикл |

Версия API отображается в OpenAPI (`/docs`) и заголовке FastAPI (`0.10.x`).
