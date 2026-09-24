#!/usr/bin/env bash
# =============================================================================
# VBXSystem — полная установка на РЕД ОС (минимальная конфигурация)
# =============================================================================
# Целевая ОС: РЕД ОС 7.3+ (Server minimal / graphical), dnf/rpm-based.
# На «голом» сервере скрипт ставит зависимости, Docker, поднимает стек,
# подставляет ваши данные из vbx.conf и пишет отчёт в отдельный файл.
#
# Использование:
#   1) cp deploy/redos/vbx.conf.example /tmp/vbx.conf
#   2) Отредактируйте /tmp/vbx.conf (пароли, host, админ…)
#   3) sudo bash deploy/redos/install.sh /tmp/vbx.conf
#
# Требования: root (sudo), доступ к репозиториям РЕД ОС (для docker-ce).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONF_FILE="${1:-}"
LOG_FILE=""
REPORT_FILE=""
STARTED_AT="$(date -Is)"
INSTALL_USER="${SUDO_USER:-${USER:-root}}"

# ---- colors (TTY only) ----
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'
  C_BLU=$'\033[0;34m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_RST=""
fi

log()  { echo -e "${C_BLU}[VBX]${C_RST} $*" | tee -a "${LOG_FILE:-/dev/null}"; }
ok()   { echo -e "${C_GRN}[OK]${C_RST}  $*" | tee -a "${LOG_FILE:-/dev/null}"; }
warn() { echo -e "${C_YEL}[WARN]${C_RST} $*" | tee -a "${LOG_FILE:-/dev/null}"; }
err()  { echo -e "${C_RED}[ERR]${C_RST}  $*" | tee -a "${LOG_FILE:-/dev/null}"; }

die() { err "$*"; exit 1; }

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Запустите от root: sudo bash $0 /path/to/vbx.conf"
  fi
}

rand_secret() {
  # 48 hex chars
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

load_conf() {
  [[ -n "${CONF_FILE}" ]] || die "Не указан файл конфигурации. Пример: sudo bash $0 deploy/redos/vbx.conf.example"
  [[ -f "${CONF_FILE}" ]] || die "Файл конфигурации не найден: ${CONF_FILE}"

  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "${CONF_FILE}"
  set +a

  : "${VBX_INSTALL_DIR:=/opt/vbx}"
  : "${VBX_HOST:=127.0.0.1}"
  : "${VBX_HTTP_PORT:=80}"
  : "${VBX_HTTPS_PORT:=443}"
  : "${VBX_SCHEME:=http}"
  : "${VBX_ADMIN_USERNAME:=admin}"
  : "${VBX_ADMIN_EMAIL:=admin@example.local}"
  : "${VBX_ADMIN_PASSWORD:=}"
  : "${VBX_ADMIN_FULL_NAME:=Администратор}"
  : "${VBX_ADMIN_ORG:=}"
  : "${VBX_ADMIN_TITLE:=}"
  : "${VBX_ADMIN_PHONE:=}"
  : "${VBX_SECRET_KEY:=}"
  : "${VBX_POSTGRES_PASSWORD:=}"
  : "${VBX_REDIS_PASSWORD:=}"
  : "${VBX_NVD_API_KEY:=}"
  : "${VBX_TIMEZONE:=Europe/Moscow}"
  : "${VBX_SOURCE_MODE:=local}"
  : "${VBX_REPO_PATH:=}"
  : "${VBX_ARCHIVE_PATH:=}"
  : "${VBX_CONFIGURE_FIREWALL:=yes}"
  : "${VBX_ADD_USER_TO_DOCKER:=yes}"
  : "${VBX_DNF_UPDATE:=no}"
  : "${VBX_DOCKER_SMOKE_TEST:=yes}"
  : "${VBX_INSTALL_REPORT:=VBX_INSTALL_INFO.txt}"
  : "${VBX_POSTGRES_MEM_LIMIT:=2g}"
  : "${VBX_API_MEM_LIMIT:=2g}"
  : "${VBX_WEB_MEM_LIMIT:=1g}"
  : "${VBX_TLS_CERT_PATH:=}"
  : "${VBX_TLS_KEY_PATH:=}"

  [[ -n "${VBX_ADMIN_PASSWORD}" ]] || die "VBX_ADMIN_PASSWORD пуст — задайте пароль в conf"
  if [[ "${VBX_ADMIN_PASSWORD}" == "ChangeMe_StrongPass_123!" ]]; then
    warn "Вы оставили пароль по умолчанию из примера — смените его после установки!"
  fi

  mkdir -p "${VBX_INSTALL_DIR}"/{logs,data,backups,uploads,certs,config}
  LOG_FILE="${VBX_INSTALL_DIR}/logs/install-$(date +%Y%m%d-%H%M%S).log"
  touch "${LOG_FILE}"

  if [[ "${VBX_INSTALL_REPORT}" = /* ]]; then
    REPORT_FILE="${VBX_INSTALL_REPORT}"
  else
    REPORT_FILE="${VBX_INSTALL_DIR}/${VBX_INSTALL_REPORT}"
  fi
}

detect_os() {
  log "Проверка ОС…"
  if [[ -f /etc/redos-release ]]; then
    ok "Обнаружен /etc/redos-release"
    cat /etc/redos-release | tee -a "${LOG_FILE}"
  elif [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "NAME=${NAME:-?} VERSION=${VERSION:-?}" | tee -a "${LOG_FILE}"
    if echo "${NAME:-} ${ID:-} ${ID_LIKE:-}" | grep -Eiq 'redos|red soft|rhel|centos|fedora|rocky|almalinux'; then
      ok "RPM-based ОС совместима с процедурой РЕД ОС/RHEL"
    else
      warn "ОС не похожа на РЕД ОС — продолжаем, но пакеты могут отличаться"
    fi
  else
    warn "Не удалось определить дистрибутив"
  fi

  command -v dnf >/dev/null 2>&1 || die "Нужен dnf (РЕД ОС / RHEL-like)"
}

install_host_packages() {
  log "Установка базовых пакетов для минимальной конфигурации…"
  dnf -y install \
    ca-certificates \
    curl \
    wget \
    tar \
    gzip \
    unzip \
    git \
    openssl \
    jq \
    firewalld \
    chrony \
    shadow-utils \
    findutils \
    grep \
    sed \
    which \
    2>&1 | tee -a "${LOG_FILE}"

  if [[ "${VBX_DNF_UPDATE}" == "yes" ]]; then
    log "dnf update (VBX_DNF_UPDATE=yes)…"
    dnf -y update 2>&1 | tee -a "${LOG_FILE}"
  fi

  systemctl enable chronyd --now 2>/dev/null || systemctl enable chrony --now 2>/dev/null || true
  ok "Базовые пакеты установлены"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker; then
    ok "Docker уже установлен и запущен: $(docker --version 2>/dev/null || true)"
  else
    log "Установка Docker CE (РЕД ОС: dnf install docker-ce docker-ce-cli)…"
    # Официальный путь для РЕД ОС 7.3 (база знаний Red Soft / R7):
    dnf -y install docker-ce docker-ce-cli 2>&1 | tee -a "${LOG_FILE}" \
      || die "Не удалось установить docker-ce. Проверьте подключение к репозиториям РЕД ОС."

    systemctl enable docker --now 2>&1 | tee -a "${LOG_FILE}"
    sleep 2
    systemctl is-active --quiet docker || die "Служба docker не active"
    ok "Docker установлен: $(docker --version)"
  fi

  # На некоторых хостах с конфликтом iptables/nft межконтейнерный трафик блокируется
  iptables -I DOCKER-USER -j ACCEPT 2>/dev/null || true

  # Compose plugin
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose: $(docker compose version)"
  else
    log "Установка docker-compose-plugin…"
    if dnf -y install docker-compose-plugin 2>&1 | tee -a "${LOG_FILE}"; then
      ok "docker-compose-plugin установлен"
    else
      warn "Плагин из dnf недоступен — ставлю бинарный Docker Compose v2"
      local arch comp_ver comp_url
      arch="$(uname -m)"
      case "${arch}" in
        x86_64|amd64) arch="x86_64" ;;
        aarch64|arm64) arch="aarch64" ;;
        *) die "Неподдерживаемая архитектура: ${arch}" ;;
      esac
      comp_ver="v2.29.7"
      comp_url="https://github.com/docker/compose/releases/download/${comp_ver}/docker-compose-linux-${arch}"
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -fsSL "${comp_url}" -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      # fallback classic binary
      ln -sfn /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    fi
    docker compose version >/dev/null 2>&1 || die "docker compose недоступен после установки"
    ok "docker compose: $(docker compose version)"
  fi

  if [[ "${VBX_ADD_USER_TO_DOCKER}" == "yes" && "${INSTALL_USER}" != "root" ]]; then
    usermod -aG docker "${INSTALL_USER}" || true
    ok "Пользователь ${INSTALL_USER} добавлен в группу docker (нужен re-login)"
  fi

  if [[ "${VBX_DOCKER_SMOKE_TEST}" == "yes" ]]; then
    log "Smoke-test: docker run hello-world…"
    docker run --rm hello-world 2>&1 | tee -a "${LOG_FILE}" || warn "hello-world не удалось (часто нет интернета к Docker Hub) — продолжаем"
  fi
}

prepare_source() {
  log "Подготовка исходников в ${VBX_INSTALL_DIR}…"
  local src=""
  case "${VBX_SOURCE_MODE}" in
    local)
      if [[ -n "${VBX_REPO_PATH}" ]]; then
        src="${VBX_REPO_PATH}"
      else
        src="${REPO_ROOT}"
      fi
      [[ -d "${src}" ]] || die "Репозиторий не найден: ${src}"
      # Если устанавливаем «из себя» в /opt/vbx — rsync/copy без .git тяжёлых артефактов
      if [[ "$(cd "${src}" && pwd)" != "$(cd "${VBX_INSTALL_DIR}" 2>/dev/null && pwd || true)" ]]; then
        if command -v rsync >/dev/null 2>&1; then
          dnf -y install rsync >/dev/null 2>&1 || true
        fi
        if command -v rsync >/dev/null 2>&1; then
          rsync -a --delete \
            --exclude '.git/' \
            --exclude 'node_modules/' \
            --exclude '.next/' \
            --exclude '__pycache__/' \
            --exclude '.venv/' \
            --exclude 'deploy/redos/vbx.conf' \
            "${src}/" "${VBX_INSTALL_DIR}/app/"
        else
          mkdir -p "${VBX_INSTALL_DIR}/app"
          tar -C "${src}" --exclude='.git' --exclude='node_modules' --exclude='.next' -cf - . \
            | tar -C "${VBX_INSTALL_DIR}/app" -xf -
        fi
      else
        mkdir -p "${VBX_INSTALL_DIR}/app"
        # уже внутри дерева — symlink/copy минимально
        ln -sfn "${src}" "${VBX_INSTALL_DIR}/app-src-link" || true
        rsync -a --exclude '.git/' "${src}/" "${VBX_INSTALL_DIR}/app/" 2>/dev/null \
          || cp -a "${src}/." "${VBX_INSTALL_DIR}/app/"
      fi
      ;;
    archive)
      [[ -n "${VBX_ARCHIVE_PATH}" && -f "${VBX_ARCHIVE_PATH}" ]] || die "VBX_ARCHIVE_PATH не задан или файл отсутствует"
      mkdir -p "${VBX_INSTALL_DIR}/app"
      tar -xzf "${VBX_ARCHIVE_PATH}" -C "${VBX_INSTALL_DIR}/app" --strip-components=1 2>/dev/null \
        || tar -xzf "${VBX_ARCHIVE_PATH}" -C "${VBX_INSTALL_DIR}/app"
      ;;
    *)
      die "Неизвестный VBX_SOURCE_MODE=${VBX_SOURCE_MODE}"
      ;;
  esac

  APP_DIR="${VBX_INSTALL_DIR}/app"
  [[ -d "${APP_DIR}" ]] || die "Каталог приложения не создан: ${APP_DIR}"
  ok "Код размещён в ${APP_DIR}"
}

ensure_compose_files() {
  # Пока приложение собирается волнами — гарантируем минимальный compose,
  # совместимый с .env, чтобы установка на РЕД ОС была проверяема end-to-end.
  if [[ ! -f "${APP_DIR}/docker-compose.yml" ]]; then
    warn "docker-compose.yml ещё нет (волна W0) — кладу bootstrap compose для РЕД ОС"
    mkdir -p "${APP_DIR}/deploy/bootstrap"
    cat > "${APP_DIR}/docker-compose.yml" <<'YAML'
# VBXSystem bootstrap compose (заменяется/расширяется волной W0+)
name: vbxsystem

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: vbx
      POSTGRES_USER: vbx
      POSTGRES_PASSWORD: ${VBX_POSTGRES_PASSWORD}
      TZ: ${VBX_TIMEZONE:-Europe/Moscow}
    volumes:
      - vbx_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vbx -d vbx"]
      interval: 5s
      timeout: 5s
      retries: 20
    mem_limit: ${VBX_POSTGRES_MEM_LIMIT:-2g}

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${VBX_REDIS_PASSWORD}"]
    volumes:
      - vbx_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${VBX_REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 20

  api:
    image: python:3.12-alpine
    restart: unless-stopped
    working_dir: /app
    environment:
      VBX_SECRET_KEY: ${VBX_SECRET_KEY}
      VBX_DATABASE_URL: postgresql+psycopg://vbx:${VBX_POSTGRES_PASSWORD}@postgres:5432/vbx
      VBX_REDIS_URL: redis://:${VBX_REDIS_PASSWORD}@redis:6379/0
      VBX_ADMIN_USERNAME: ${VBX_ADMIN_USERNAME}
      VBX_ADMIN_EMAIL: ${VBX_ADMIN_EMAIL}
      VBX_ADMIN_PASSWORD: ${VBX_ADMIN_PASSWORD}
      VBX_NVD_API_KEY: ${VBX_NVD_API_KEY}
      TZ: ${VBX_TIMEZONE:-Europe/Moscow}
    command: >
      sh -c "python -m http.server 8000 --bind 0.0.0.0"
    ports:
      - "${VBX_API_PORT:-8000}:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    mem_limit: ${VBX_API_MEM_LIMIT:-2g}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8000/ >/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "${VBX_HTTP_PORT:-80}:80"
    volumes:
      - ./deploy/bootstrap/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./deploy/bootstrap/www:/usr/share/nginx/html:ro
    depends_on:
      - api
    mem_limit: ${VBX_WEB_MEM_LIMIT:-1g}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1/ >/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  vbx_pg:
  vbx_redis:
YAML
  fi

  mkdir -p "${APP_DIR}/deploy/bootstrap/www"
  if [[ ! -f "${APP_DIR}/deploy/bootstrap/nginx.conf" ]]; then
    cat > "${APP_DIR}/deploy/bootstrap/nginx.conf" <<'NGINX'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  location / {
    try_files $uri /index.html;
  }
  location /api/ {
    proxy_pass http://api:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
NGINX
  fi

  if [[ ! -f "${APP_DIR}/deploy/bootstrap/www/index.html" ]]; then
    cat > "${APP_DIR}/deploy/bootstrap/www/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VBXSystem</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: system-ui, sans-serif; background:#0b0e14; color:#e8eefc;
      min-height:100vh; display:grid; place-items:center; }
    .box { max-width:40rem; padding:2rem; border:1px solid #243044; border-radius:16px; background:#12161f; }
    h1 { margin:0 0 .5rem; font-size:1.75rem; }
    p { color:#9aa8c7; line-height:1.5; }
    code { color:#7dd3fc; }
  </style>
</head>
<body>
  <main class="box">
    <h1>VBXSystem</h1>
    <p>Bootstrap-установка на РЕД ОС прошла успешно. Стек Docker поднят.</p>
    <p>Полноценное приложение появится после волн разработки W0+. Проверьте отчёт установки <code>VBX_INSTALL_INFO.txt</code>.</p>
  </main>
</body>
</html>
HTML
  fi
}

generate_secrets_and_env() {
  log "Генерация секретов и .env…"
  [[ -n "${VBX_SECRET_KEY}" ]] || VBX_SECRET_KEY="$(rand_secret)"
  [[ -n "${VBX_POSTGRES_PASSWORD}" ]] || VBX_POSTGRES_PASSWORD="$(rand_secret)"
  [[ -n "${VBX_REDIS_PASSWORD}" ]] || VBX_REDIS_PASSWORD="$(rand_secret)"

  local public_url
  if [[ "${VBX_SCHEME}" == "https" ]]; then
    if [[ "${VBX_HTTPS_PORT}" == "443" ]]; then
      public_url="https://${VBX_HOST}"
    else
      public_url="https://${VBX_HOST}:${VBX_HTTPS_PORT}"
    fi
  else
    if [[ "${VBX_HTTP_PORT}" == "80" ]]; then
      public_url="http://${VBX_HOST}"
    else
      public_url="http://${VBX_HOST}:${VBX_HTTP_PORT}"
    fi
  fi

  umask 077
  cat > "${VBX_INSTALL_DIR}/config/vbx.env" <<EOF
# Generated by deploy/redos/install.sh on ${STARTED_AT}
# DO NOT COMMIT

VBX_HOST=${VBX_HOST}
VBX_SCHEME=${VBX_SCHEME}
VBX_HTTP_PORT=${VBX_HTTP_PORT}
VBX_HTTPS_PORT=${VBX_HTTPS_PORT}
VBX_API_PORT=8000
VBX_PUBLIC_URL=${public_url}

VBX_SECRET_KEY=${VBX_SECRET_KEY}
VBX_POSTGRES_PASSWORD=${VBX_POSTGRES_PASSWORD}
VBX_REDIS_PASSWORD=${VBX_REDIS_PASSWORD}
VBX_NVD_API_KEY=${VBX_NVD_API_KEY}

VBX_ADMIN_USERNAME=${VBX_ADMIN_USERNAME}
VBX_ADMIN_EMAIL=${VBX_ADMIN_EMAIL}
VBX_ADMIN_PASSWORD=${VBX_ADMIN_PASSWORD}
VBX_ADMIN_FULL_NAME=${VBX_ADMIN_FULL_NAME}
VBX_ADMIN_ORG=${VBX_ADMIN_ORG}
VBX_ADMIN_TITLE=${VBX_ADMIN_TITLE}
VBX_ADMIN_PHONE=${VBX_ADMIN_PHONE}

VBX_TIMEZONE=${VBX_TIMEZONE}
VBX_POSTGRES_MEM_LIMIT=${VBX_POSTGRES_MEM_LIMIT}
VBX_API_MEM_LIMIT=${VBX_API_MEM_LIMIT}
VBX_WEB_MEM_LIMIT=${VBX_WEB_MEM_LIMIT}
TZ=${VBX_TIMEZONE}
VBX_CORS_ORIGINS=${public_url},http://127.0.0.1,http://localhost
VBX_API_INTERNAL_URL=http://api:8000
VBX_DATABASE_URL=postgresql+psycopg://vbx:${VBX_POSTGRES_PASSWORD}@postgres:5432/vbx
VBX_REDIS_URL=redis://:${VBX_REDIS_PASSWORD}@redis:6379/0
EOF

  # Compose читает .env из каталога проекта
  cp -a "${VBX_INSTALL_DIR}/config/vbx.env" "${APP_DIR}/.env"
  chmod 600 "${VBX_INSTALL_DIR}/config/vbx.env" "${APP_DIR}/.env"
  ok "Секреты записаны в ${VBX_INSTALL_DIR}/config/vbx.env (mode 600)"
}

configure_firewall() {
  if [[ "${VBX_CONFIGURE_FIREWALL}" != "yes" ]]; then
    warn "Пропуск firewall (VBX_CONFIGURE_FIREWALL!=yes)"
    return
  fi
  if ! command -v firewall-cmd >/dev/null 2>&1; then
    warn "firewalld не установлен — пропускаю"
    return
  fi
  log "Настройка firewalld…"
  systemctl enable firewalld --now 2>&1 | tee -a "${LOG_FILE}" || true
  if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port="${VBX_HTTP_PORT}/tcp" || true
    firewall-cmd --permanent --add-port="${VBX_HTTPS_PORT}/tcp" || true
    firewall-cmd --permanent --add-port=8000/tcp || true
    firewall-cmd --reload || true
    ok "Порты ${VBX_HTTP_PORT}/tcp, ${VBX_HTTPS_PORT}/tcp, 8000/tcp открыты"
  else
    warn "firewalld не active — порты не открыты автоматически"
  fi
}

compose() {
  ( cd "${APP_DIR}" && docker compose --env-file .env "$@" )
}

start_stack() {
  log "Сборка/загрузка образов и запуск стека…"
  compose pull 2>&1 | tee -a "${LOG_FILE}" || warn "pull завершился с предупреждениями"
  compose up -d 2>&1 | tee -a "${LOG_FILE}" || die "docker compose up не удался"
  ok "Контейнеры запущены"
  compose ps 2>&1 | tee -a "${LOG_FILE}"
}

wait_healthy() {
  log "Ожидание готовности сервисов (до ~3 мин)…"
  local i
  for i in $(seq 1 36); do
    if curl -fsS "http://127.0.0.1:${VBX_HTTP_PORT}/" >/dev/null 2>&1; then
      ok "HTTP отвечает на порту ${VBX_HTTP_PORT}"
      return 0
    fi
    sleep 5
  done
  warn "HTTP ещё не ответил — проверьте: docker compose -f ${APP_DIR}/docker-compose.yml ps / logs"
}

write_report() {
  local finished public_url
  finished="$(date -Is)"
  if [[ "${VBX_SCHEME}" == "https" ]]; then
    if [[ "${VBX_HTTPS_PORT}" == "443" ]]; then
      public_url="https://${VBX_HOST}"
    else
      public_url="https://${VBX_HOST}:${VBX_HTTPS_PORT}"
    fi
  else
    if [[ "${VBX_HTTP_PORT}" == "80" ]]; then
      public_url="http://${VBX_HOST}"
    else
      public_url="http://${VBX_HOST}:${VBX_HTTP_PORT}"
    fi
  fi

  umask 077
  cat > "${REPORT_FILE}" <<EOF
================================================================================
VBXSystem — отчёт об установке
================================================================================
Дата начала:     ${STARTED_AT}
Дата окончания:  ${finished}
Хост ОС:         $(hostname -f 2>/dev/null || hostname)
Установка:       ${VBX_INSTALL_DIR}
Приложение:      ${APP_DIR}
Лог установки:   ${LOG_FILE}
Конфиг env:      ${VBX_INSTALL_DIR}/config/vbx.env
Исходный conf:   ${CONF_FILE}

--- Доступ -------------------------------------------------------------------
URL:             ${public_url}
HTTP порт:       ${VBX_HTTP_PORT}
HTTPS порт:      ${VBX_HTTPS_PORT}
API (внутр.):    http://${VBX_HOST}:8000

--- Учётная запись супер-администратора --------------------------------------
Логин:           ${VBX_ADMIN_USERNAME}
Email:           ${VBX_ADMIN_EMAIL}
Пароль:          ${VBX_ADMIN_PASSWORD}
ФИО:             ${VBX_ADMIN_FULL_NAME}
Организация:     ${VBX_ADMIN_ORG}
Должность:       ${VBX_ADMIN_TITLE}
Телефон:         ${VBX_ADMIN_PHONE}

--- Секреты (хранить закрыто!) -----------------------------------------------
VBX_SECRET_KEY:          ${VBX_SECRET_KEY}
POSTGRES password:       ${VBX_POSTGRES_PASSWORD}
REDIS password:          ${VBX_REDIS_PASSWORD}
NVD API key (если был):  ${VBX_NVD_API_KEY:-<не задан — укажите в UI>}

--- Docker -------------------------------------------------------------------
$(docker --version 2>/dev/null || echo 'docker n/a')
$(docker compose version 2>/dev/null || echo 'compose n/a')

Сервисы:
$(cd "${APP_DIR}" && docker compose ps 2>/dev/null || true)

--- Полезные команды ---------------------------------------------------------
cd ${APP_DIR}
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=200
docker compose --env-file .env restart
docker compose --env-file .env down

Бэкап / восстановление:
  COMPOSE_DIR=${APP_DIR} VBX_BACKUP_DIR=${VBX_INSTALL_DIR}/backups bash ${APP_DIR}/scripts/backup.sh
  COMPOSE_DIR=${APP_DIR} bash ${APP_DIR}/scripts/restore.sh ${VBX_INSTALL_DIR}/backups/<stamp>
  bash ${APP_DIR}/deploy/redos/validate-install.sh

Обновление (после появления нового релиза):
  sudo bash ${VBX_INSTALL_DIR}/app/deploy/redos/install.sh ${VBX_INSTALL_DIR}/config/vbx.conf.used

--- Безопасность -------------------------------------------------------------
1) Ограничьте доступ к ${REPORT_FILE} и ${VBX_INSTALL_DIR}/config/vbx.env (сейчас 600).
2) Смените пароль администратора после первого входа.
3) Настройте HTTPS (VBX_SCHEME=https + сертификаты) для промышленной среды.
4) Ключ NVD задайте в Настройки → База данных, если не указали при установке.
5) Не публикуйте порт API 8000 наружу; задайте VBX_TRUSTED_HOSTS / VBX_CORS_ORIGINS.

================================================================================
EOF
  chmod 600 "${REPORT_FILE}"

  # Сохраняем использованный conf без необходимости хранить рядом с git
  cp -a "${CONF_FILE}" "${VBX_INSTALL_DIR}/config/vbx.conf.used" 2>/dev/null || true
  chmod 600 "${VBX_INSTALL_DIR}/config/vbx.conf.used" 2>/dev/null || true

  ok "Отчёт записан: ${REPORT_FILE}"
}

print_summary() {
  local url
  if [[ "${VBX_SCHEME}" == "https" ]]; then
    url="https://${VBX_HOST}"
    [[ "${VBX_HTTPS_PORT}" == "443" ]] || url="${url}:${VBX_HTTPS_PORT}"
  else
    url="http://${VBX_HOST}"
    [[ "${VBX_HTTP_PORT}" == "80" ]] || url="${url}:${VBX_HTTP_PORT}"
  fi
  echo
  echo "================================================================================"
  echo -e "${C_GRN}VBXSystem: установка завершена${C_RST}"
  echo "URL:    ${url}"
  echo "Отчёт:  ${REPORT_FILE}"
  echo "Лог:    ${LOG_FILE}"
  echo "Admin:  ${VBX_ADMIN_USERNAME} / (см. отчёт)"
  echo "================================================================================"
}

main() {
  need_root
  load_conf
  log "Старт установки VBXSystem на РЕД ОС"
  detect_os
  install_host_packages
  install_docker
  prepare_source
  ensure_compose_files
  generate_secrets_and_env
  configure_firewall
  start_stack
  wait_healthy
  write_report
  print_summary
}

main "$@"
