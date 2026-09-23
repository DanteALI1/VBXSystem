# Конфигурация

Все переменные описаны по файлу [`.env.example`](../../.env.example). Секреты в документацию не копировать — только имена и смысл.

| Переменная | Пример в `.env.example` | Описание |
|------------|-------------------------|----------|
| `DATABASE_URL` | `postgresql://vuln:vuln@postgres:5432/vuln` | Postgres DSN. В compose сервисное имя хоста `postgres`; локально — `localhost`. |
| `REDIS_URL` | `redis://redis:6379` | Redis для BullMQ (app enqueue + worker). Локально — `localhost`. |
| `AUTH_SECRET` | `change-me` | Секрет Better Auth. **Обязательно сменить** перед любым не-dev окружением. |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@local.dev` | Email первого admin при `npm run bootstrap:admin`. |
| `BOOTSTRAP_ADMIN_PASSWORD` | `ChangeMe123!` | Пароль первого admin. Сменить после первого входа. |
| `NVD_API_KEY` | *(пусто)* | Опциональный API key NVD; без ключа — пауза ~6s между страницами + жёстче rate limit. |
| `NVD_SYNC_DAYS` | `30` | Окно дней `lastModStartDate`…`lastModEndDate` для live NVD sync (override телом job `days`). |
| `NVD_SYNC_MODE` | `live` | `live` — HTTP к NVD API; `fixture` — `tests/fixtures/nvd-fragment.json` без сети. Job `mode` перекрывает env. |
| `BDU_XML_URL` | `https://bdu.fstec.ru/files/documents/vulxml.xml` | URL полного XML BDU для live download. |
| `BDU_SYNC_MODE` | `live` | `live` — download URL; `fixture` — `tests/fixtures/bdu-mini.xml`. Upload API задаёт путь файлом, не через этот флаг. |
| `SCAN_FIXTURE_MODE` | *(закомментировано)* | `1` / `true` / `yes` — nmap/nuclei всегда используют `tests/fixtures/` без бинарей. Job `options.fixture` также включает fixture. |
| `NMAP_BIN` | *(закомментировано)* | Абсолютный путь к nmap, если не на `PATH`. Не executable / отсутствует → fixture fallback. |
| `NUCLEI_BIN` | *(закомментировано)* | Абсолютный путь к nuclei, аналогично. |
| `APP_URL` | `http://localhost:3000` | Публичный base URL (Better Auth `baseURL`, абсолютные ссылки). |

## Режимы sync

| Режим | Когда | Сеть |
|-------|-------|------|
| NVD `live` | default / `NVD_SYNC_MODE=live` / job `mode: "live"` | да, NVD API |
| NVD `fixture` | env или job | нет |
| BDU `live` | default / env live, нет `uploadedPath` | да, `BDU_XML_URL` |
| BDU `fixture` | env или job | нет (локальный mini XML) |
| BDU `upload` | job с `uploadedPath` после `POST …/bdu/upload` | нет (локальный файл в `storage/bdu/`) |

Подробности: [features/sync.md](../features/sync.md).

## Режимы сканов (nmap / nuclei)

| Режим | Когда | Бинарь |
|-------|-------|--------|
| fixture | `options.fixture === true` **или** `SCAN_FIXTURE_MODE=1\|true\|yes` **или** binary missing | не нужен |
| live | иначе | `nmap` / `nuclei` (или `NMAP_BIN` / `NUCLEI_BIN`) |

zap/openvas: только stub; empty success **только** при `options.fixture: true`. Env `SCAN_FIXTURE_MODE` на stubs не действует.

Подробности: [features/scans.md](../features/scans.md), [ADR-003](../decisions/ADR-003-scan-adapters.md).

## Переопределения docker-compose

Для сервисов `app` и `worker` compose явно задаёт:

- `DATABASE_URL=postgresql://vuln:vuln@postgres:5432/vuln`
- `REDIS_URL=redis://redis:6379`
- `APP_URL=http://localhost:3000` (только app)

`env_file: .env` подтягивает остальные ключи (`AUTH_SECRET`, bootstrap, NVD/BDU, `SCAN_FIXTURE_MODE`, binary paths).

Пути storage (compose volume):

```
./storage         → /app/storage
./storage/reports → /app/storage/reports
```

BDU download/upload пишет в `storage/bdu/`.  
Scan reports: `storage/reports/<scan_job_id>/`.

## Не документируемые / отсутствующие в `.env.example`

Не изобретать дополнительные секреты. Если понадобится (например отдельный `STORAGE_PATH`), добавить сначала в `.env.example`, затем сюда.
