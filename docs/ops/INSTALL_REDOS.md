# Установка VBXSystem на РЕД ОС (минимальная конфигурация)

Целевой стенд: **РЕД ОС 7.3+**, профиль **Server minimal**.

Официальная установка Docker на РЕД ОС:  
`dnf install docker-ce docker-ce-cli` → `systemctl enable docker --now`  
(база знаний Red Soft / инструкции R7). Установщик сделает это сам.

---

## 1. Два режима

### A. Интерактивный мастер (рекомендуется)

```bash
cd /path/to/VBXSystem   # или /opt/vbx-src после git clone
sudo bash deploy/redos/install.sh
```

Скрипт **по этапам** спрашивает:

| Этап | Что спрашивает |
|------|----------------|
| 0 | Подтверждение старта |
| 1 | IP/DNS, http/https, порты |
| 2 | Каталог установки, источник кода |
| 3 | **PostgreSQL**: имя БД, роль, пароль (Enter = сгенерировать) |
| 4 | **Redis**: пароль (Enter = сгенерировать) |
| 5 | Организация, timezone |
| 6 | **Admin**: логин, email, ФИО, должность, телефон — **пароль НЕ спрашивается** |
| 7 | Опционально доп. УЗ: логин, email, ФИО, роль, **пароль вручную** |
| 8 | NVD API key (можно позже в UI) |
| 9 | firewalld / docker group / hello-world / dnf update / MailHog |

В конце:

- генерируется и показывается **пароль Admin**;
- пишется отчёт `/opt/vbx/VBX_INSTALL_INFO.txt` (mode **600**) со всеми секретами;
- доп. УЗ создаются в БД после поднятия API.

### B. Файл конфигурации (автоматизация / CI)

```bash
sudo cp deploy/redos/vbx.conf.example /root/vbx.conf
sudo chmod 600 /root/vbx.conf
sudo nano /root/vbx.conf
sudo bash deploy/redos/install.sh /root/vbx.conf
```

Пустые `VBX_POSTGRES_PASSWORD` / `VBX_REDIS_PASSWORD` / `VBX_SECRET_KEY` и пустой/дефолтный `VBX_ADMIN_PASSWORD` — **генерируются**.

Без TTY (pipe): автоматически `VBX_ASSUME_YES=1`.

```bash
VBX_ASSUME_YES=1 sudo bash deploy/redos/install.sh
```

---

## 2. Что делает установщик

1. Root + `dnf`
2. Базовые пакеты minimal (`curl`, `openssl`, `firewalld`, `chrony`, `rsync`, …)
3. Docker CE + compose (+ `scripts/fix-docker-bridge.sh` при наличии)
4. Копирует код в `/opt/vbx/app`
5. Пишет `config/vbx.env` и `.env` (mode 600)
6. firewalld (порты web/api)
7. `docker compose up -d --build`
8. Ждёт `/ready` + `/login`
9. Создаёт доп. УЗ (если задали)
10. Отчёт `VBX_INSTALL_INFO.txt` + сводка в консоль

Стек: Postgres 16, Redis 7, FastAPI (`api` + `worker`), Next.js (`web`), опционально MailHog.

---

## 3. После установки

```bash
sudo less /opt/vbx/VBX_INSTALL_INFO.txt
cd /opt/vbx/app
docker compose --env-file .env ps
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1/login
bash deploy/redos/validate-install.sh
```

Бэкапы: [BACKUP.md](BACKUP.md). Обновление: [UPGRADE.md](UPGRADE.md).  
Безопасность: [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md). Пользователь: [USER_GUIDE_RU.md](USER_GUIDE_RU.md).

---

## 4. Требования к серверу

| Ресурс | Минимум | Рекомендуется |
|--------|---------|----------------|
| CPU | 2 vCPU | 4+ |
| RAM | 4 GB | 8–16 GB |
| Диск | 40 GB | 100+ GB SSD |
| Сеть | dnf-репы; Docker Hub или зеркало |

---

## 5. HTTPS

В мастере выберите `https` и укажите пути к сертификатам, либо в conf:

```bash
VBX_SCHEME="https"
VBX_TLS_CERT_PATH="/path/to/fullchain.pem"
VBX_TLS_KEY_PATH="/path/to/privkey.pem"
```

Рекомендуется TLS на внешнем reverse-proxy; порт API не публиковать наружу.

```bash
VBX_CORS_ORIGINS=https://vbx.example.local
VBX_TRUSTED_HOSTS=vbx.example.local,localhost
```

---

## 6. Валидация

```bash
bash -n deploy/redos/install.sh
bash deploy/redos/validate-install.sh
```

| Проверка | Ожидание |
|----------|----------|
| Синтаксис `install.sh` | OK |
| Compose healthy | api/web/postgres/redis/worker |
| Отчёт | содержит Admin логин/пароль, DSN БД |
| E2E smoke | login → search → CVE |

---

## 7. Безопасность паролей

1. Пароль **Admin** показывает установщик один раз в консоли + в отчёте `600`.
2. Пароли доп. УЗ задаёте вы на этапе 7 — в отчёт они **не** дублируются (только логин/роль).
3. Смените пароль Admin после первого входа.
4. Не коммитьте `vbx.env` / `VBX_INSTALL_INFO.txt`.
