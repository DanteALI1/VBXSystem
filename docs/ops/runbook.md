# Runbook (эксплуатация)

## Ежедневные проверки

1. `GET /api/health/ready` — 200.
2. `SyncState` NVD/BDU: `lastSuccessAt` не старше ожидаемого cron + запас.
3. Длина очередей Redis (`BULLMQ_PREFIX`): нет аномального роста `failed`.
4. Диск: `SCAN_ARTIFACTS_DIR`, `BDU_UPLOAD_DIR`.

## Старт / стоп

```bash
# infra
docker compose up -d postgres redis

# app (prod)
pnpm build
pnpm start

# workers
pnpm worker
```

Graceful stop workers: SIGTERM → дождаться текущего job (BullMQ lock).

## Бэкапы

| Что | Как |
|-----|-----|
| PostgreSQL | `pg_dump` по расписанию; хранить offline |
| Артефакты сканов | опционально; можно восстановить пересканом |
| Redis | необязателен (очереди эфемерны); не хранить единственную копию данных |

Проверка restore на lab раз в период (TODO политика).

## Ротация секретов

1. Новый `BETTER_AUTH_SECRET` → все сессии инвалидируются.
2. `NVD_API_KEY` — обновить env + restart workers.
3. Пароли admin — UI/bootstrap controlled.

## Синхронизация вручную

```bash
curl -X POST "$URL/api/sync/nvd" -H "Cookie: ..."
# BDU upload
curl -X POST "$URL/api/sync/bdu/upload" -F file=@bdu.xml -H "Cookie: ..."
```

Следить за логами worker: upserted/skipped.

## Сканирование

1. Добавить цель в allowlist (admin).
2. Создать ScanJob (analyst).
3. При `ALLOWLIST_REJECTED` — исправить allowlist, не отключать `SCAN_REJECT_NON_ALLOWLIST`.

## Обновление версии

1. Announce maintenance.
2. Stop workers → backup DB → migrate → deploy app → start workers.
3. Smoke: login, dashboard, vulnerabilities page (TC-017 частично).

## Инциденты

См. [troubleshooting.md](./troubleshooting.md). Эскалация: проверить RBAC/audit кто ставил сканы.

## Запрещено в prod

- Отключать allowlist gate.
- Подключать nuclei templates вне `cves/` / `vulnerabilities/`.
- Хранить bootstrap password в долгоживущем env без `BOOTSTRAP_ADMIN_DISABLED`.
