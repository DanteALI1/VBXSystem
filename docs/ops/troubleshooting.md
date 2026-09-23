# Troubleshooting

## Приложение не стартует

| Симптом | Проверка | Действие |
|---------|----------|----------|
| Ошибка `DATABASE_URL` | `psql $DATABASE_URL -c 'select 1'` | Поднять postgres, поправить URL |
| Redis connection refused | `redis-cli -u $REDIS_URL ping` | `docker compose up -d redis` |
| Auth misconfigured | длина `BETTER_AUTH_SECRET`, совпадение `BETTER_AUTH_URL` с origin | Выровнять env, restart |

## Не удаётся войти

1. Bootstrap выполнен? (`pnpm bootstrap:admin`).
2. Caps/раскладка пароля; сброс через bootstrap upsert (lab).
3. Cookie Secure на HTTP — в dev `BETTER_AUTH_URL=http://localhost:3000`.
4. Очистить cookies сайта.

TC-001.

## Sync NVD не идёт / 429

- Без API key — низкий rate limit; ожидаем backoff (TC-006).
- Проверить `NVD_API_KEY`, часы системы, логи worker.
- `SyncState.lastError` содержит текст последней ошибки.

## BDU не обновляется

- Download URL недоступен из контура → использовать upload (TC-008).
- XML schema изменилась → смотреть parse errors в логах; обновить парсер.
- Связь CVE не находится — нормально для части записей; проверить TC-007 на фикстуре.

## Scan сразу failed

| errorMessage | Причина |
|--------------|---------|
| `ALLOWLIST_REJECTED` | Цель вне allowlist (TC-011) |
| `BINARY_NOT_FOUND` | Нет nmap/nuclei в PATH |
| `TEMPLATES_PATH_DENIED` | Путь templates вне allow |
| timeout | Цель не отвечает; увеличить timeout в params |

## Пустые findings после «успешного» скана

- Ingest job в `failed`? Смотреть очередь `scan:ingest`.
- Фикстура/профиль без matchers.
- Дедуп скрыл дубли — проверить `lastSeenAt`.

## Viewer видит кнопки sync, но…

Сервер обязан вернуть 403 даже если UI баг (TC-002). Если sync реально стартовал под viewer — critical RBAC regression.

## Dashboard нули при наличии данных

- Кэш (если появится) — invalidate.
- Неверный tenant/фильтр — в single-tenant проверить SQL counters (TC-016).
- Пользователь смотрит пустую БД другого env.

## Advanced search 400

- Превышен `ADVANCED_SEARCH_MAX_FIELDS`.
- Синтаксическая ошибка парсера — упростить query (TC-020).

## Производительность каталога

- Нет индексов — сверить [data-model.md](../architecture/data-model.md).
- Слишком большой `pageSize` — урезать до max.
- Тяжёлый `description:` like — TODO pg_trgm.

## Логи

```bash
# app
LOG_LEVEL=debug pnpm start
# worker
LOG_LEVEL=debug pnpm worker
```

Не включать debug с полным raw NVD payload в долгоживущих prod-логах (PII/объём).
