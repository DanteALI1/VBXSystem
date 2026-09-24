# Резервное копирование и восстановление

Скрипты: `scripts/backup.sh`, `scripts/restore.sh`.

## Что входит в бэкап

| Артефакт | Содержимое |
|----------|------------|
| `postgres.dump` | `pg_dump -Fc` базы `vbx` |
| `uploads.tar.gz` | `/app/uploads` (BDU XML и пр.) |
| `manifest.txt` | метка времени, hostname, `compose ps` |

Каталог по умолчанию: `<repo>/backups/<UTC-stamp>/`  
или `VBX_BACKUP_DIR` (на РЕД ОС обычно `/opt/vbx/backups`).

## Backup

```bash
cd /opt/vbx/app   # или корень репозитория
export COMPOSE_DIR="$(pwd)"
export VBX_BACKUP_DIR=/opt/vbx/backups
sudo bash scripts/backup.sh
```

Ротация: оставляются последние `VBX_BACKUP_KEEP` (по умолчанию 14) каталогов.

Cron (ежедневно в 02:30):

```cron
30 2 * * * COMPOSE_DIR=/opt/vbx/app VBX_BACKUP_DIR=/opt/vbx/backups /opt/vbx/app/scripts/backup.sh >> /opt/vbx/logs/backup.log 2>&1
```

## Restore

```bash
# Остановите нагрузку при возможности
cd /opt/vbx/app
sudo bash scripts/restore.sh /opt/vbx/backups/20260924T023000Z
```

Скрипт останавливает `api`/`worker`, делает `pg_restore --clean`, поднимает uploads и `compose up -d`.

После восстановления:

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/ready
docker compose --env-file .env logs --tail=100 api
```

## Примечания

- `.env` / секреты **не** входят в dump — храните `config/vbx.env` отдельно (уже mode 600).
- Перед restore убедитесь, что версия схемы Alembic совместима с дампом (см. `docs/ops/UPGRADE.md`).
