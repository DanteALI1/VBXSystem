# Troubleshooting

## App не стартует / 500

- Проверить `DATABASE_URL` и доступность Postgres.
- Проверить `AUTH_SECRET` и `APP_URL` (Better Auth).
- `npm run typecheck` / логи Next.js.

## Не подключается к БД в Docker

- Host `postgres` работает **внутри** сети compose; с хоста — `localhost:5432`.
- Дождаться healthcheck: `docker compose ps`.
- Учётные: user/db/password `vuln` (см. compose + `.env.example`).

## Redis / worker

- `REDIS_URL` должен совпадать у app и worker.
- Ошибка `maxRetriesPerRequest`: в worker уже `maxRetriesPerRequest: null` (ioredis + BullMQ).
- Wave 0: отсутствие processors — норма; jobs будут висеть в queued до реализации.

## Миграции

- `db:migrate` падает → проверить `drizzle/` и `DATABASE_URL`.
- Конфликт схемы → не смешивать `db:push` и migrate на одной БД без понимания.

## NVD 429 / медленный sync

- Задать `NVD_API_KEY`.
- Уменьшить `NVD_SYNC_DAYS` для первого прогона.
- Смотреть backoff в worker (TC-006).

## BDU XML недоступен

- Сеть/egress до `BDU_XML_URL`.
- Использовать upload fallback (TC-008).
- Проверить `file_hash` в `sync_states` (ложный skip).

## Скан отвергнут

- Target не в allowlist или правило `enabled=false`.
- Проверить `lib/domain/allowlist.ts` логику CIDR/URL.
- Unit: `tests/unit/allowlist.test.ts`, TC-011.

## Логин не работает

- Wave 0: UI placeholder, middleware не wired.
- После реализации: bootstrap admin, верный `APP_URL`, cookies.

## Docker недоступен в среде агента

- Зафиксировать в PROGRESS/RESULTS; unit-тесты без Docker всё ещё runnable.
- Скрин A1 — `blocked` / note.
