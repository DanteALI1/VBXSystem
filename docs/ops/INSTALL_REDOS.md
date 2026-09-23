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
8. Поднимает `docker compose up -d`
9. Ждёт HTTP-готовности
10. Пишет отчёт **`VBX_INSTALL_INFO.txt`** (пароли, URL, команды)

Пока код приложения ещё собирается волнами, скрипт подкладывает **bootstrap compose** (Postgres + Redis + stub API + nginx), чтобы установку на РЕД ОС можно было проверить сразу. Волна **W0** заменит stub на боевые сервисы, **не ломая** контракт `.env` / имена сервисов.

---

## 2. Подготовка

На машине администратора (или на самом сервере):

```bash
# 1. Получите репозиторий (пример)
sudo mkdir -p /opt/vbx-src
sudo git clone <URL_РЕПОЗИТОРИЯ> /opt/vbx-src
# или распакуйте release-архив

cd /opt/vbx-src

# 2. Скопируйте и заполните конфиг своими данными
sudo cp deploy/redos/vbx.conf.example /root/vbx.conf
sudo chmod 600 /root/vbx.conf
sudo nano /root/vbx.conf
```

Обязательно замените:

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

## 4. Требования к серверу (ориентир)

| Ресурс | Минимум | Рекомендуется |
|--------|---------|----------------|
| CPU | 2 vCPU | 4+ |
| RAM | 4 GB | 8–16 GB (полное зеркало NVD) |
| Диск | 40 GB | 100+ GB SSD |
| Сеть | доступ к dnf-репам РЕД ОС; для pull образов — Docker Hub или зеркало |

Для air-gapped: заранее загрузите образы `postgres:16-alpine`, `redis:7-alpine`, `nginx`, runtime API/web и передайте через `docker load`.

---

## 5. Полезные команды после установки

```bash
cd /opt/vbx/app
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=200
docker compose --env-file .env restart
```

---

## 6. HTTPS

В `vbx.conf`:

```bash
VBX_SCHEME="https"
VBX_TLS_CERT_PATH="/path/to/fullchain.pem"
VBX_TLS_KEY_PATH="/path/to/privkey.pem"
```

Полный TLS termination в proxy будет доведён в W0/W8; до этого можно поставить внешний reverse-proxy (nginx/HAProxy) перед портом 80.

---

## 7. Требования к волнам разработки

- **W0:** боевой `docker-compose.yml`, Dockerfile’ы api/web/worker; сохранить имена env из `vbx.env`.
- **W8:** проверить этот скрипт на чистой РЕД ОС minimal VM; обновить `INSTALL_REDOS.md` по факту.

См. также: `docs/agents/W0_foundation.md`, `docs/agents/W8_hardening.md`.
