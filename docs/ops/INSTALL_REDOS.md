# Установка VBXSystem на РЕД ОС (минимальная конфигурация)

Целевой стенд: **РЕД ОС 7.3+**, профиль **Server minimal** (на сервере изначально может не быть ничего, кроме базовой ОС и доступа к репозиториям).

Официальная установка Docker на РЕД ОС:  
`dnf install docker-ce docker-ce-cli` → `systemctl enable docker --now`  
(база знаний Red Soft / инструкции R7).

---

## 1. Что делает установщик

Скрипт `deploy/redos/install.sh` выполняет **полный цикл «от и до»**:

1. Проверяет root и наличие `dnf`
2. Ставит базовые пакеты минималки (`curl`, `openssl`, `firewalld`, `chrony`, …)
3. Ставит **Docker CE** + **docker compose** (plugin или binary fallback)
4. (Опционально) smoke-test `hello-world`
5. Копирует код в `/opt/vbx/app` (или путь из conf)
6. Генерирует секреты и `.env` из ваших данных
7. Открывает порты в **firewalld**
8. Поднимает `docker compose up -d --build`
9. Ждёт HTTP-готовности
10. Пишет отчёт **`VBX_INSTALL_INFO.txt`** (пароли, URL, команды)

Стек: Postgres 16, Redis 7, FastAPI (`api` + `worker`), Next.js (`web`), опционально MailHog.

---

## 2. Подготовка

```bash
sudo mkdir -p /opt/vbx-src
sudo git clone <URL_РЕПОЗИТОРИЯ> /opt/vbx-src
# или распакуйте release-архив

cd /opt/vbx-src
sudo cp deploy/redos/vbx.conf.example /root/vbx.conf
sudo chmod 600 /root/vbx.conf
sudo nano /root/vbx.conf
```

| Параметр | Пример |
|----------|--------|
| `VBX_HOST` | IP или DNS сервера |
| `VBX_ADMIN_PASSWORD` | сильный пароль |
| `VBX_ADMIN_EMAIL` | корпоративная почта |
| `VBX_ADMIN_ORG` | организация |
| `VBX_NVD_API_KEY` | опционально (можно в UI позже) |

Пустые `VBX_SECRET_KEY` / `VBX_POSTGRES_PASSWORD` / `VBX_REDIS_PASSWORD` скрипт **сгенерирует сам**.

---

## 3. Запуск установки

```bash
sudo bash deploy/redos/install.sh /root/vbx.conf
```

В конце:

- URL системы
- путь к отчёту (по умолчанию `/opt/vbx/VBX_INSTALL_INFO.txt`)
- путь к логу `/opt/vbx/logs/install-*.log`

```bash
sudo less /opt/vbx/VBX_INSTALL_INFO.txt
```

Файл отчёта и `config/vbx.env` создаются с правами **600**.

---

## 4. Требования к серверу

| Ресурс | Минимум | Рекомендуется |
|--------|---------|----------------|
| CPU | 2 vCPU | 4+ |
| RAM | 4 GB | 8–16 GB (полное зеркало NVD) |
| Диск | 40 GB | 100+ GB SSD |
| Сеть | dnf-репы РЕД ОС; Docker Hub или зеркало |

Air-gapped: заранее `docker load` образов `postgres:16-alpine`, `redis:7-alpine` и собранных api/web.

---

## 5. После установки

```bash
cd /opt/vbx/app
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=200
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1/login
```

Бэкапы: [BACKUP.md](BACKUP.md). Обновление: [UPGRADE.md](UPGRADE.md).  
Безопасность: [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md). Пользователь: [USER_GUIDE_RU.md](USER_GUIDE_RU.md).

---

## 6. HTTPS

В `vbx.conf`:

```bash
VBX_SCHEME="https"
VBX_TLS_CERT_PATH="/path/to/fullchain.pem"
VBX_TLS_KEY_PATH="/path/to/privkey.pem"
```

Рекомендуется TLS termination на внешнем nginx/HAProxy перед портом web; порт API `8000` не публиковать наружу.

Prod-настройки в `.env`:

```bash
VBX_CORS_ORIGINS=https://vbx.example.local
VBX_TRUSTED_HOSTS=vbx.example.local,localhost
```

---

## 7. Валидация install.sh (W8)

Чистая РЕД ОС VM в этой среде недоступна. Проверено в CI/dev-агенте:

| Проверка | Результат |
|----------|-----------|
| `bash -n deploy/redos/install.sh` | синтаксис OK |
| `docker compose` стек (тот же compose, что ставит install) | healthy: api/web/postgres/redis/worker |
| Контракт `.env` / `VBX_INSTALL_INFO.txt` поля | соответствуют `write_report` в install.sh |
| E2E Playwright smoke | login → search → CVE → ticket → database settings |

На чистой РЕД ОС minimal оператор повторяет §2–§3 и сверяет отчёт с таблицей выше.

Скрипт самопроверки (на уже установленном хосте):

```bash
bash deploy/redos/validate-install.sh
```
