# Конфигурация (переменные окружения)

Источник истины для списка ключей — корневой `.env.example`. Ниже — контракт Wave 0: все ключи, которые должны быть в примере, с назначением. Значения в docs — **плейсхолдеры**, не секреты.

## Приложение

| Переменная | Обязательна | Описание | Пример |
|------------|-------------|----------|--------|
| `NODE_ENV` | нет | `development` / `production` / `test` | `development` |
| `APP_NAME` | нет | Имя в UI/логах | `VBX` |
| `PORT` | нет | Порт Next.js | `3000` |
| `LOG_LEVEL` | нет | pino level | `info` |

## База данных и Redis

| Переменная | Обязательна | Описание | Пример |
|------------|-------------|----------|--------|
| `DATABASE_URL` | да | Postgres connection string | `postgresql://vbx:vbx@localhost:5432/vbx` |
| `REDIS_URL` | да | Redis для BullMQ и кэша сессий (если используется) | `redis://localhost:6379` |
| `BULLMQ_PREFIX` | нет | Префикс ключей очередей | `vbx` |

## Better Auth

| Переменная | Обязательна | Описание | Пример |
|------------|-------------|----------|--------|
| `BETTER_AUTH_SECRET` | да | Секрет подписи сессий (≥32 символа) | `change-me-to-a-long-random-string` |
| `BETTER_AUTH_URL` | да | Публичный origin приложения | `http://localhost:3000` |
| `AUTH_TRUSTED_ORIGINS` | нет | CSV доп. origins | `http://127.0.0.1:3000` |

Задел (не обязательны Wave 0):

| Переменная | Описание |
|------------|----------|
| `AUTH_LDAP_URL` | TODO LDAP |
| `AUTH_OIDC_ISSUER` | TODO OIDC |
| `AUTH_OIDC_CLIENT_ID` | TODO |
| `AUTH_OIDC_CLIENT_SECRET` | TODO |

## Bootstrap admin

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `BOOTSTRAP_ADMIN_EMAIL` | да при первом запуске | Email создаваемого admin |
| `BOOTSTRAP_ADMIN_PASSWORD` | да при первом запуске | Пароль (только в `.env`, не в git) |
| `BOOTSTRAP_ADMIN_NAME` | нет | Имя, default `Administrator` |

После успешного bootstrap рекомендуется удалить пароль из `.env` или отключить повторный bootstrap флагом:

| Переменная | Описание |
|------------|----------|
| `BOOTSTRAP_ADMIN_DISABLED` | `true` — скрипт no-op |

## NVD sync

| Переменная | Обязательна | Описание | Пример |
|------------|-------------|----------|--------|
| `NVD_API_BASE` | нет | Base URL API | `https://services.nvd.nist.gov/rest/json/cves/2.0` |
| `NVD_API_KEY` | нет | Ключ NIST (выше rate limit) | *(пусто в example)* |
| `NVD_SYNC_CRON` | нет | Cron expression | `0 */6 * * *` |
| `NVD_REQUEST_TIMEOUT_MS` | нет | Таймаут HTTP | `30000` |
| `NVD_MAX_RETRIES` | нет | Ретраи при 429/5xx | `5` |

## BDU sync

| Переменная | Обязательна | Описание | Пример |
|------------|-------------|----------|--------|
| `BDU_XML_URL` | нет | URL XML-фида ФСТЭК | `https://bdu.fstec.ru/files/documents/vulxml.xml` |
| `BDU_FEED_URL` | нет | Alias для `BDU_XML_URL` | |
| `BDU_SYNC_CRON` | нет | Cron | `0 3 * * *` |
| `BDU_UPLOAD_DIR` | нет | Каталог upload fallback | `./storage/bdu-uploads` |
| `BDU_UPLOAD_MAX_BYTES` | нет | Лимит multipart | `67108864` |

## Сканирование

| Переменная | Обязательна | Описание | Пример |
|------------|-------------|----------|--------|
| `SCAN_NMAP_PATH` | нет | Бинарь nmap | `nmap` |
| `SCAN_NUCLEI_PATH` | нет | Бинарь nuclei | `nuclei` |
| `SCAN_NUCLEI_TEMPLATES_DIR` | да для nuclei | Корень templates | `./templates/nuclei` |
| `SCAN_NUCLEI_ALLOWED_PATHS` | нет | CSV relative allow | `cves,vulnerabilities` |
| `SCAN_ARTIFACTS_DIR` | нет | Сырые отчёты | `./data/scan-artifacts` |
| `SCAN_MAX_CONCURRENCY` | нет | Параллельные scan jobs | `2` |
| `SCAN_REJECT_NON_ALLOWLIST` | нет | Жёсткий отказ | `true` |

## Поиск и UI

| Переменная | Обязательна | Описание | Default |
|------------|-------------|----------|---------|
| `ADVANCED_SEARCH_MAX_FIELDS` | нет | Макс. число field-клауз в advanced query | `20` |
| `VULN_PAGE_SIZE_DEFAULT` | нет | Размер страницы каталога | `50` |
| `VULN_PAGE_SIZE_MAX` | нет | Потолок page size | `200` |

## Feature flags (задел)

| Переменная | Описание |
|------------|----------|
| `FEATURE_LDAP` | `false` |
| `FEATURE_OIDC` | `false` |
| `FEATURE_SHARED_SAVED_VIEWS` | `true` |

## Пример фрагмента `.env.example`

```bash
NODE_ENV=development
APP_NAME=VBX
PORT=3000
LOG_LEVEL=info

DATABASE_URL=postgresql://vbx:vbx@localhost:5432/vbx
REDIS_URL=redis://localhost:6379
BULLMQ_PREFIX=vbx

BETTER_AUTH_SECRET=change-me-to-a-long-random-string
BETTER_AUTH_URL=http://localhost:3000

BOOTSTRAP_ADMIN_EMAIL=admin@example.local
BOOTSTRAP_ADMIN_PASSWORD=change-me-now
BOOTSTRAP_ADMIN_NAME=Administrator

NVD_API_BASE=https://services.nvd.nist.gov/rest/json/cves/2.0
# NVD_API_KEY=
NVD_SYNC_CRON=0 */6 * * *
NVD_MAX_RETRIES=5

# BDU_FEED_URL=
BDU_UPLOAD_DIR=./data/bdu-uploads

SCAN_NMAP_PATH=nmap
SCAN_NUCLEI_PATH=nuclei
SCAN_NUCLEI_TEMPLATES_DIR=./templates/nuclei
SCAN_NUCLEI_ALLOWED_PATHS=cves,vulnerabilities
SCAN_ARTIFACTS_DIR=./data/scan-artifacts
SCAN_REJECT_NON_ALLOWLIST=true

ADVANCED_SEARCH_MAX_FIELDS=20
```

Если `.env.example` ещё не создан в репозитории — создать в Wave 0 foundation вместе с compose; этот документ остаётся спецификацией ключей.

## Секреты

- Не логировать `BETTER_AUTH_SECRET`, пароли, API keys.
- В CI использовать secrets store; в test — отдельные `.env.test` без прод-данных.
