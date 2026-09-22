# Конфигурация

Все переменные описаны по файлу [`.env.example`](../../.env.example). Секреты в документацию не копировать — только имена и смысл.

| Переменная | Пример в `.env.example` | Описание |
|------------|-------------------------|----------|
| `DATABASE_URL` | `postgresql://vuln:vuln@postgres:5432/vuln` | Postgres DSN. В compose сервисное имя хоста `postgres`; локально — `localhost`. |
| `REDIS_URL` | `redis://redis:6379` | Redis для BullMQ. Локально — `localhost`. |
| `AUTH_SECRET` | `change-me` | Секрет Better Auth. **Обязательно сменить** перед любым не-dev окружением. |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@local.dev` | Email первого admin при bootstrap. |
| `BOOTSTRAP_ADMIN_PASSWORD` | `ChangeMe123!` | Пароль первого admin. Сменить после первого входа. |
| `NVD_API_KEY` | *(пусто)* | Опциональный API key NVD; повышает rate limit. |
| `NVD_SYNC_DAYS` | `30` | Окно дней для job `nvd-sync`. |
| `BDU_XML_URL` | `https://bdu.fstec.ru/files/documents/vulxml.xml` | URL полного XML BDU. |
| `APP_URL` | `http://localhost:3000` | Публичный base URL приложения (Better Auth `baseURL`, ссылки). |

## Переопределения docker-compose

Для сервисов `app` и `worker` compose явно задаёт:

- `DATABASE_URL=postgresql://vuln:vuln@postgres:5432/vuln`
- `REDIS_URL=redis://redis:6379`
- `APP_URL=http://localhost:3000` (только app)

`env_file: .env` подтягивает остальные ключи (`AUTH_SECRET`, bootstrap, NVD/BDU).

## Не документируемые / отсутствующие в `.env.example`

Не изобретать дополнительные секреты. Если понадобится (например `STORAGE_PATH`), добавить сначала в `.env.example`, затем сюда.
