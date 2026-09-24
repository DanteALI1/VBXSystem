#!/usr/bin/env bash
# =============================================================================
# VBXSystem — интерактивная установка на РЕД ОС (minimal) / RHEL-like
# =============================================================================
#
# Режимы:
#   sudo bash deploy/redos/install.sh
#       → мастер: на каждом этапе спрашивает параметры и креды
#   sudo bash deploy/redos/install.sh /path/to/vbx.conf
#       → без вопросов (из файла); пустые секреты генерируются
#   VBX_ASSUME_YES=1 sudo bash deploy/redos/install.sh
#       → без TTY: всё по умолчанию, секреты и пароль Admin генерируются
#
# Важно:
#   • Пароль супер-админа Admin ВСЕГДА генерируется установщиком и выдаётся
#     только в конце (консоль + VBX_INSTALL_INFO.txt mode 600).
#   • Пароли PostgreSQL / Redis можно ввести на этапе БД или оставить пустыми —
#     тогда они тоже будут сгенерированы.
#   • Дополнительную УЗ (аналитик и т.п.) можно создать на отдельном этапе:
#     имя + пароль запрашиваются явно.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONF_FILE="${1:-}"
ASSUME_YES="${VBX_ASSUME_YES:-0}"
LOG_FILE=""
REPORT_FILE=""
STARTED_AT="$(date -Is)"
INSTALL_USER="${SUDO_USER:-${USER:-root}}"
APP_DIR=""
EXTRA_USERS_FILE=""

# ---- defaults (перезаписываются мастером / conf) ----
VBX_INSTALL_DIR="${VBX_INSTALL_DIR:-/opt/vbx}"
VBX_HOST="${VBX_HOST:-}"
VBX_HTTP_PORT="${VBX_HTTP_PORT:-80}"
VBX_HTTPS_PORT="${VBX_HTTPS_PORT:-443}"
VBX_API_PORT="${VBX_API_PORT:-8000}"
VBX_SCHEME="${VBX_SCHEME:-http}"
VBX_TLS_CERT_PATH="${VBX_TLS_CERT_PATH:-}"
VBX_TLS_KEY_PATH="${VBX_TLS_KEY_PATH:-}"

VBX_POSTGRES_DB="${VBX_POSTGRES_DB:-vbx}"
VBX_POSTGRES_USER="${VBX_POSTGRES_USER:-vbx}"
VBX_POSTGRES_PASSWORD="${VBX_POSTGRES_PASSWORD:-}"
VBX_REDIS_PASSWORD="${VBX_REDIS_PASSWORD:-}"
VBX_SECRET_KEY="${VBX_SECRET_KEY:-}"

VBX_ADMIN_USERNAME="${VBX_ADMIN_USERNAME:-admin}"
VBX_ADMIN_EMAIL="${VBX_ADMIN_EMAIL:-}"
VBX_ADMIN_PASSWORD="${VBX_ADMIN_PASSWORD:-}"
VBX_ADMIN_FULL_NAME="${VBX_ADMIN_FULL_NAME:-}"
VBX_ADMIN_ORG="${VBX_ADMIN_ORG:-}"
VBX_ADMIN_TITLE="${VBX_ADMIN_TITLE:-Администратор ИБ}"
VBX_ADMIN_PHONE="${VBX_ADMIN_PHONE:-}"

VBX_NVD_API_KEY="${VBX_NVD_API_KEY:-}"
VBX_TIMEZONE="${VBX_TIMEZONE:-Europe/Moscow}"
VBX_POSTGRES_MEM_LIMIT="${VBX_POSTGRES_MEM_LIMIT:-2g}"
VBX_API_MEM_LIMIT="${VBX_API_MEM_LIMIT:-2g}"
VBX_WEB_MEM_LIMIT="${VBX_WEB_MEM_LIMIT:-1g}"

VBX_SOURCE_MODE="${VBX_SOURCE_MODE:-local}"
VBX_REPO_PATH="${VBX_REPO_PATH:-}"
VBX_ARCHIVE_PATH="${VBX_ARCHIVE_PATH:-}"
VBX_CONFIGURE_FIREWALL="${VBX_CONFIGURE_FIREWALL:-yes}"
VBX_ADD_USER_TO_DOCKER="${VBX_ADD_USER_TO_DOCKER:-yes}"
VBX_DNF_UPDATE="${VBX_DNF_UPDATE:-no}"
VBX_DOCKER_SMOKE_TEST="${VBX_DOCKER_SMOKE_TEST:-yes}"
VBX_INSTALL_REPORT="${VBX_INSTALL_REPORT:-VBX_INSTALL_INFO.txt}"
VBX_MAILHOG="${VBX_MAILHOG:-yes}"

# Доп. пользователи: tab-separated lines username|email|full_name|password|role
EXTRA_USERS=()

# ---- colors ----
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'
  C_BLU=$'\033[0;34m'; C_CYA=$'\033[0;36m'; C_BOLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_CYA=""; C_BOLD=""; C_RST=""
fi

log()  { echo -e "${C_BLU}[VBX]${C_RST} $*" | tee -a "${LOG_FILE:-/dev/null}"; }
ok()   { echo -e "${C_GRN}[OK]${C_RST}  $*" | tee -a "${LOG_FILE:-/dev/null}"; }
warn() { echo -e "${C_YEL}[WARN]${C_RST} $*" | tee -a "${LOG_FILE:-/dev/null}"; }
err()  { echo -e "${C_RED}[ERR]${C_RST}  $*" | tee -a "${LOG_FILE:-/dev/null}"; }
die()  { err "$*"; exit 1; }
stage() {
  echo
  echo -e "${C_BOLD}${C_CYA}════════════════════════════════════════════════════════════${C_RST}"
  echo -e "${C_BOLD}${C_CYA}  $*${C_RST}"
  echo -e "${C_BOLD}${C_CYA}════════════════════════════════════════════════════════════${C_RST}"
  echo "$*" >> "${LOG_FILE:-/dev/null}"
}

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Запустите от root: sudo bash $0 [vbx.conf]"
  fi
}

have_tty() { [[ -t 0 && -t 1 ]]; }

rand_secret() {
  local n="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${n}"
  else
    head -c "$((n * 2))" /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c "$((n * 2))"
  fi
}

# Читаемый пароль Admin (без неоднозначных символов)
rand_admin_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 18 | tr -d '/+=' | head -c 20
  else
    head -c 32 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 20
  fi
}

prompt_line() {
  local prompt="$1" default="${2:-}" val=""
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    printf '%s' "$default"
    return
  fi
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [${default}]: " val || true
  else
    read -r -p "$prompt: " val || true
  fi
  printf '%s' "${val:-$default}"
}

prompt_password() {
  # $1 prompt, $2 allow empty generate (1/0)
  local prompt="$1" allow_gen="${2:-1}" a="" b=""
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    if [[ "$allow_gen" == "1" ]]; then
      rand_secret 16
      return
    fi
    printf ''
    return
  fi
  while true; do
    if [[ "$allow_gen" == "1" ]]; then
      read -r -s -p "$prompt (Enter = сгенерировать): " a || true
    else
      read -r -s -p "$prompt: " a || true
    fi
    echo >&2
    if [[ -z "$a" && "$allow_gen" == "1" ]]; then
      a="$(rand_secret 16)"
      echo "  → сгенерирован надёжный пароль" >&2
      printf '%s' "$a"
      return
    fi
    if [[ -z "$a" ]]; then
      echo "  пустой пароль не допускается" >&2
      continue
    fi
    if [[ ${#a} -lt 10 ]]; then
      echo "  минимум 10 символов" >&2
      continue
    fi
    read -r -s -p "  Повторите пароль: " b || true
    echo >&2
    if [[ "$a" != "$b" ]]; then
      echo "  не совпадают — ещё раз" >&2
      continue
    fi
    printf '%s' "$a"
    return
  done
}

confirm() {
  local prompt="$1" default="${2:-y}" ans=""
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    return 0
  fi
  read -r -p "$prompt [${default}/n]: " ans || true
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[YyДд] ]]
}

valid_ident() {
  [[ "$1" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]
}

valid_email() {
  [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]
}

public_url() {
  if [[ "${VBX_SCHEME}" == "https" ]]; then
    if [[ "${VBX_HTTPS_PORT}" == "443" ]]; then
      echo "https://${VBX_HOST}"
    else
      echo "https://${VBX_HOST}:${VBX_HTTPS_PORT}"
    fi
  else
    if [[ "${VBX_HTTP_PORT}" == "80" ]]; then
      echo "http://${VBX_HOST}"
    else
      echo "http://${VBX_HOST}:${VBX_HTTP_PORT}"
    fi
  fi
}

# =============================================================================
# Конфиг из файла
# =============================================================================
load_conf_file() {
  [[ -f "${CONF_FILE}" ]] || die "Файл конфигурации не найден: ${CONF_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${CONF_FILE}"
  set +a
  ASSUME_YES=1
  ok "Загружен conf: ${CONF_FILE} (неинтерактивный режим)"
}

# =============================================================================
# Интерактивный мастер
# =============================================================================
wizard() {
  if ! have_tty && [[ "${ASSUME_YES}" != "1" ]]; then
    warn "Нет TTY — включаю VBX_ASSUME_YES=1 (все секреты будут сгенерированы)"
    ASSUME_YES=1
  fi

  stage "Этап 0 · Добро пожаловать"
  echo "Установщик VBXSystem на РЕД ОС / RHEL-like (Docker Compose)."
  echo "На каждом этапе будут запрошены нужные данные."
  echo
  echo "  • Пароль Admin генерируется автоматически и показывается в КОНЦЕ."
  echo "  • Пароли БД/Redis можно ввести или оставить пустыми (генерация)."
  echo "  • Можно создать дополнительную УЗ (имя + пароль)."
  echo
  confirm "Продолжить установку?" "y" || die "Отменено пользователем"

  stage "Этап 1 · Сеть и URL"
  local detect_host
  detect_host="$(hostname -I 2>/dev/null | awk '{print $1}')"
  detect_host="${detect_host:-$(hostname -f 2>/dev/null || hostname || echo 127.0.0.1)}"
  VBX_HOST="$(prompt_line "IP или DNS сервера (как открывают пользователи)" "${VBX_HOST:-$detect_host}")"
  [[ -n "${VBX_HOST}" ]] || die "Хост обязателен"

  VBX_SCHEME="$(prompt_line "Схема (http|https)" "${VBX_SCHEME}")"
  [[ "${VBX_SCHEME}" == "http" || "${VBX_SCHEME}" == "https" ]] || die "Схема: http или https"
  VBX_HTTP_PORT="$(prompt_line "HTTP порт web" "${VBX_HTTP_PORT}")"
  VBX_HTTPS_PORT="$(prompt_line "HTTPS порт (если нужен)" "${VBX_HTTPS_PORT}")"
  VBX_API_PORT="$(prompt_line "Порт API (обычно только localhost)" "${VBX_API_PORT}")"

  if [[ "${VBX_SCHEME}" == "https" ]]; then
    VBX_TLS_CERT_PATH="$(prompt_line "Путь к TLS certificate (fullchain)" "${VBX_TLS_CERT_PATH}")"
    VBX_TLS_KEY_PATH="$(prompt_line "Путь к TLS private key" "${VBX_TLS_KEY_PATH}")"
    if [[ -n "${VBX_TLS_CERT_PATH}" && ! -f "${VBX_TLS_CERT_PATH}" ]]; then
      warn "Файл сертификата не найден: ${VBX_TLS_CERT_PATH} (проверьте после установки)"
    fi
  fi

  stage "Этап 2 · Каталоги установки"
  VBX_INSTALL_DIR="$(prompt_line "Каталог установки" "${VBX_INSTALL_DIR}")"
  VBX_SOURCE_MODE="$(prompt_line "Источник кода (local|archive)" "${VBX_SOURCE_MODE}")"
  if [[ "${VBX_SOURCE_MODE}" == "archive" ]]; then
    VBX_ARCHIVE_PATH="$(prompt_line "Путь к tar.gz релиза" "${VBX_ARCHIVE_PATH}")"
  else
    VBX_REPO_PATH="$(prompt_line "Путь к репозиторию (пусто = этот clone)" "${VBX_REPO_PATH:-$REPO_ROOT}")"
  fi

  stage "Этап 3 · База данных PostgreSQL (контейнер)"
  echo "PostgreSQL поднимается в Docker. Задайте имя БД, роль и пароль."
  echo "Текущий пароль postgres на хосте НЕ нужен."
  echo
  VBX_POSTGRES_DB="$(prompt_line "Имя базы" "${VBX_POSTGRES_DB}")"
  VBX_POSTGRES_USER="$(prompt_line "Роль (пользователь) БД" "${VBX_POSTGRES_USER}")"
  valid_ident "${VBX_POSTGRES_DB}" || die "Имя БД: только [A-Za-z_][A-Za-z0-9_]*"
  valid_ident "${VBX_POSTGRES_USER}" || die "Роль БД: только [A-Za-z_][A-Za-z0-9_]*"
  echo
  echo "Пароль роли ${VBX_POSTGRES_USER}:"
  if [[ -z "${VBX_POSTGRES_PASSWORD}" ]]; then
    VBX_POSTGRES_PASSWORD="$(prompt_password "  Пароль PostgreSQL" 1)"
  else
    ok "Пароль PostgreSQL уже задан (env/conf)"
  fi
  [[ -n "${VBX_POSTGRES_PASSWORD}" ]] || die "Пароль PostgreSQL пуст"

  stage "Этап 4 · Redis"
  echo "Пароль Redis (requirepass):"
  if [[ -z "${VBX_REDIS_PASSWORD}" ]]; then
    VBX_REDIS_PASSWORD="$(prompt_password "  Пароль Redis" 1)"
  else
    ok "Пароль Redis уже задан (env/conf)"
  fi
  [[ -n "${VBX_REDIS_PASSWORD}" ]] || die "Пароль Redis пуст"

  stage "Этап 5 · Организация и локаль"
  VBX_ADMIN_ORG="$(prompt_line "Название организации" "${VBX_ADMIN_ORG:-ООО Пример}")"
  VBX_TIMEZONE="$(prompt_line "Часовой пояс" "${VBX_TIMEZONE}")"

  stage "Этап 6 · Учётная запись Admin (пароль сгенерируется в конце)"
  echo "Сейчас запрашиваются только профиль Admin. Пароль НЕ спрашивается —"
  echo "установщик сгенерирует его сам и покажет в финальном отчёте."
  echo
  VBX_ADMIN_USERNAME="$(prompt_line "Логин Admin" "${VBX_ADMIN_USERNAME}")"
  valid_ident "${VBX_ADMIN_USERNAME}" || die "Логин Admin: [A-Za-z_][A-Za-z0-9_]*"
  VBX_ADMIN_EMAIL="$(prompt_line "Email Admin" "${VBX_ADMIN_EMAIL:-${VBX_ADMIN_USERNAME}@${VBX_HOST}}")"
  valid_email "${VBX_ADMIN_EMAIL}" || die "Некорректный email: ${VBX_ADMIN_EMAIL}"
  VBX_ADMIN_FULL_NAME="$(prompt_line "ФИО Admin" "${VBX_ADMIN_FULL_NAME:-Главный Администратор}")"
  VBX_ADMIN_TITLE="$(prompt_line "Должность" "${VBX_ADMIN_TITLE}")"
  VBX_ADMIN_PHONE="$(prompt_line "Телефон (опционально)" "${VBX_ADMIN_PHONE}")"
  # Пароль Admin всегда генерируем сами (даже если в conf был дефолт)
  VBX_ADMIN_PASSWORD="$(rand_admin_password)"
  ok "Пароль Admin сгенерирован (будет показан только в конце)"

  stage "Этап 7 · Дополнительная учётная запись (опционально)"
  EXTRA_USERS=()
  if confirm "Создать ещё одну УЗ (например аналитика)?" "n"; then
    while true; do
      local eu_user eu_email eu_name eu_pass eu_role
      eu_user="$(prompt_line "  Логин доп. УЗ" "analyst")"
      valid_ident "${eu_user}" || { warn "Некорректный логин"; continue; }
      eu_email="$(prompt_line "  Email" "${eu_user}@${VBX_HOST}")"
      valid_email "${eu_email}" || { warn "Некорректный email"; continue; }
      eu_name="$(prompt_line "  ФИО" "Аналитик ИБ")"
      eu_role="$(prompt_line "  Роль (analyst|viewer|admin|ticket_manager)" "analyst")"
      echo "  Пароль для ${eu_user} (обязателен — введите сами):"
      eu_pass="$(prompt_password "  Пароль ${eu_user}" 0)"
      [[ -n "${eu_pass}" ]] || { warn "Пароль обязателен"; continue; }
      EXTRA_USERS+=("${eu_user}|${eu_email}|${eu_name}|${eu_pass}|${eu_role}")
      ok "Доп. УЗ запланирована: ${eu_user} (${eu_role})"
      confirm "Добавить ещё одну УЗ?" "n" || break
    done
  else
    ok "Доп. УЗ пропускаем"
  fi

  stage "Этап 8 · Источники данных (опционально)"
  VBX_NVD_API_KEY="$(prompt_line "NVD API key (пусто = задать позже в UI)" "${VBX_NVD_API_KEY}")"

  stage "Этап 9 · Система / firewall / Docker"
  VBX_CONFIGURE_FIREWALL="$(prompt_line "Открыть порты в firewalld? (yes|no)" "${VBX_CONFIGURE_FIREWALL}")"
  VBX_ADD_USER_TO_DOCKER="$(prompt_line "Добавить ${INSTALL_USER} в группу docker? (yes|no)" "${VBX_ADD_USER_TO_DOCKER}")"
  VBX_DOCKER_SMOKE_TEST="$(prompt_line "Smoke-test hello-world? (yes|no)" "${VBX_DOCKER_SMOKE_TEST}")"
  VBX_DNF_UPDATE="$(prompt_line "Выполнить dnf update? (yes|no, обычно no)" "${VBX_DNF_UPDATE}")"
  VBX_MAILHOG="$(prompt_line "Поднять MailHog для SMTP-тестов? (yes|no)" "${VBX_MAILHOG}")"

  if [[ -z "${VBX_SECRET_KEY}" ]]; then
    VBX_SECRET_KEY="$(rand_secret 32)"
  fi

  stage "Сводка перед установкой"
  cat <<EOF
  Хост:            ${VBX_HOST}
  URL:             $(public_url)
  Каталог:         ${VBX_INSTALL_DIR}
  PostgreSQL:      ${VBX_POSTGRES_USER}@/${VBX_POSTGRES_DB}  (пароль задан)
  Redis:           пароль задан
  Admin логин:     ${VBX_ADMIN_USERNAME}  <${VBX_ADMIN_EMAIL}>
  Admin ФИО:       ${VBX_ADMIN_FULL_NAME}
  Admin пароль:    *** будет показан в конце ***
  Организация:     ${VBX_ADMIN_ORG}
  Доп. УЗ:         ${#EXTRA_USERS[@]} шт.
  NVD key:         ${VBX_NVD_API_KEY:+задан}${VBX_NVD_API_KEY:-не задан}
  Firewall:        ${VBX_CONFIGURE_FIREWALL}
EOF
  echo
  confirm "Всё верно — начать установку?" "y" || die "Отменено"
}

# =============================================================================
# Подготовка каталогов / лога
# =============================================================================
prepare_dirs() {
  mkdir -p "${VBX_INSTALL_DIR}"/{logs,data,backups,uploads,certs,config}
  LOG_FILE="${VBX_INSTALL_DIR}/logs/install-$(date +%Y%m%d-%H%M%S).log"
  touch "${LOG_FILE}"
  if [[ "${VBX_INSTALL_REPORT}" = /* ]]; then
    REPORT_FILE="${VBX_INSTALL_REPORT}"
  else
    REPORT_FILE="${VBX_INSTALL_DIR}/${VBX_INSTALL_REPORT}"
  fi
  EXTRA_USERS_FILE="${VBX_INSTALL_DIR}/config/extra-users.tsv"
  : > "${EXTRA_USERS_FILE}"
  chmod 600 "${EXTRA_USERS_FILE}"
  local line
  for line in "${EXTRA_USERS[@]:-}"; do
    [[ -n "${line}" ]] || continue
    printf '%s\n' "${line}" >> "${EXTRA_USERS_FILE}"
  done
}

# =============================================================================
# ОС / Docker / код (из прежнего установщика)
# =============================================================================
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
      ok "RPM-based ОС совместима"
    else
      warn "ОС не похожа на РЕД ОС — продолжаем"
    fi
  else
    warn "Не удалось определить дистрибутив"
  fi
  command -v dnf >/dev/null 2>&1 || die "Нужен dnf (РЕД ОС / RHEL-like)"
}

install_host_packages() {
  log "Установка базовых пакетов…"
  dnf -y install \
    ca-certificates curl wget tar gzip unzip git openssl jq \
    firewalld chrony shadow-utils findutils grep sed which rsync \
    2>&1 | tee -a "${LOG_FILE}"
  if [[ "${VBX_DNF_UPDATE}" == "yes" ]]; then
    log "dnf update…"
    dnf -y update 2>&1 | tee -a "${LOG_FILE}"
  fi
  systemctl enable chronyd --now 2>/dev/null || systemctl enable chrony --now 2>/dev/null || true
  ok "Базовые пакеты установлены"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker; then
    ok "Docker уже запущен: $(docker --version 2>/dev/null || true)"
  else
    log "Установка Docker CE…"
    dnf -y install docker-ce docker-ce-cli 2>&1 | tee -a "${LOG_FILE}" \
      || die "Не удалось установить docker-ce. Проверьте репозитории РЕД ОС."
    systemctl enable docker --now 2>&1 | tee -a "${LOG_FILE}"
    sleep 2
    systemctl is-active --quiet docker || die "Служба docker не active"
    ok "Docker: $(docker --version)"
  fi

  # Cloud/VM: hairpin bridge иногда блокирует container↔container
  if [[ -x "${REPO_ROOT}/scripts/fix-docker-bridge.sh" ]]; then
    bash "${REPO_ROOT}/scripts/fix-docker-bridge.sh" 2>&1 | tee -a "${LOG_FILE}" || true
  else
    iptables -I DOCKER-USER -j ACCEPT 2>/dev/null || true
  fi

  if docker compose version >/dev/null 2>&1; then
    ok "docker compose: $(docker compose version)"
  else
    log "Установка docker-compose-plugin…"
    if ! dnf -y install docker-compose-plugin 2>&1 | tee -a "${LOG_FILE}"; then
      warn "Плагин из dnf недоступен — бинарный Compose v2"
      local arch="x86_64" comp_ver="v2.29.7"
      case "$(uname -m)" in
        aarch64|arm64) arch="aarch64" ;;
        x86_64|amd64) arch="x86_64" ;;
        *) die "Неподдерживаемая архитектура: $(uname -m)" ;;
      esac
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -fsSL "https://github.com/docker/compose/releases/download/${comp_ver}/docker-compose-linux-${arch}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      ln -sfn /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    fi
    docker compose version >/dev/null 2>&1 || die "docker compose недоступен"
    ok "docker compose: $(docker compose version)"
  fi

  if [[ "${VBX_ADD_USER_TO_DOCKER}" == "yes" && "${INSTALL_USER}" != "root" ]]; then
    usermod -aG docker "${INSTALL_USER}" || true
    ok "Пользователь ${INSTALL_USER} → группа docker (нужен re-login)"
  fi

  if [[ "${VBX_DOCKER_SMOKE_TEST}" == "yes" ]]; then
    log "Smoke-test hello-world…"
    docker run --rm hello-world 2>&1 | tee -a "${LOG_FILE}" \
      || warn "hello-world не удался (часто нет Docker Hub) — продолжаем"
  fi
}

prepare_source() {
  log "Подготовка исходников в ${VBX_INSTALL_DIR}/app…"
  local src=""
  case "${VBX_SOURCE_MODE}" in
    local)
      src="${VBX_REPO_PATH:-$REPO_ROOT}"
      [[ -d "${src}" ]] || die "Репозиторий не найден: ${src}"
      mkdir -p "${VBX_INSTALL_DIR}/app"
      if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete \
          --exclude '.git/' --exclude 'node_modules/' --exclude '.next/' \
          --exclude '__pycache__/' --exclude '.venv/' \
          --exclude 'deploy/redos/vbx.conf' \
          "${src}/" "${VBX_INSTALL_DIR}/app/"
      else
        tar -C "${src}" --exclude='.git' --exclude='node_modules' --exclude='.next' -cf - . \
          | tar -C "${VBX_INSTALL_DIR}/app" -xf -
      fi
      ;;
    archive)
      [[ -n "${VBX_ARCHIVE_PATH}" && -f "${VBX_ARCHIVE_PATH}" ]] \
        || die "VBX_ARCHIVE_PATH не задан или файл отсутствует"
      mkdir -p "${VBX_INSTALL_DIR}/app"
      tar -xzf "${VBX_ARCHIVE_PATH}" -C "${VBX_INSTALL_DIR}/app" --strip-components=1 2>/dev/null \
        || tar -xzf "${VBX_ARCHIVE_PATH}" -C "${VBX_INSTALL_DIR}/app"
      ;;
    *)
      die "Неизвестный VBX_SOURCE_MODE=${VBX_SOURCE_MODE}"
      ;;
  esac
  APP_DIR="${VBX_INSTALL_DIR}/app"
  [[ -f "${APP_DIR}/docker-compose.yml" ]] || die "Нет docker-compose.yml в ${APP_DIR}"
  ok "Код в ${APP_DIR}"
}

write_env() {
  log "Запись секретов и .env…"
  [[ -n "${VBX_SECRET_KEY}" ]] || VBX_SECRET_KEY="$(rand_secret 32)"
  [[ -n "${VBX_POSTGRES_PASSWORD}" ]] || VBX_POSTGRES_PASSWORD="$(rand_secret 16)"
  [[ -n "${VBX_REDIS_PASSWORD}" ]] || VBX_REDIS_PASSWORD="$(rand_secret 16)"
  [[ -n "${VBX_ADMIN_PASSWORD}" ]] || VBX_ADMIN_PASSWORD="$(rand_admin_password)"

  local url
  url="$(public_url)"

  umask 077
  cat > "${VBX_INSTALL_DIR}/config/vbx.env" <<EOF
# Generated by deploy/redos/install.sh on ${STARTED_AT}
# DO NOT COMMIT — mode 600

VBX_HOST=${VBX_HOST}
VBX_SCHEME=${VBX_SCHEME}
VBX_HTTP_PORT=${VBX_HTTP_PORT}
VBX_HTTPS_PORT=${VBX_HTTPS_PORT}
VBX_API_PORT=${VBX_API_PORT}
VBX_PUBLIC_URL=${url}

VBX_SECRET_KEY=${VBX_SECRET_KEY}
VBX_POSTGRES_DB=${VBX_POSTGRES_DB}
VBX_POSTGRES_USER=${VBX_POSTGRES_USER}
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
VBX_CORS_ORIGINS=${url},http://127.0.0.1,http://localhost
VBX_API_INTERNAL_URL=http://api:8000
VBX_DATABASE_URL=postgresql+psycopg://${VBX_POSTGRES_USER}:${VBX_POSTGRES_PASSWORD}@postgres:5432/${VBX_POSTGRES_DB}
VBX_REDIS_URL=redis://:${VBX_REDIS_PASSWORD}@redis:6379/0
EOF

  cp -a "${VBX_INSTALL_DIR}/config/vbx.env" "${APP_DIR}/.env"
  chmod 600 "${VBX_INSTALL_DIR}/config/vbx.env" "${APP_DIR}/.env"
  ok ".env записан (mode 600)"
}

configure_firewall() {
  if [[ "${VBX_CONFIGURE_FIREWALL}" != "yes" ]]; then
    warn "Пропуск firewall"
    return
  fi
  if ! command -v firewall-cmd >/dev/null 2>&1; then
    warn "firewalld нет — пропускаю"
    return
  fi
  log "Настройка firewalld…"
  systemctl enable firewalld --now 2>&1 | tee -a "${LOG_FILE}" || true
  if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port="${VBX_HTTP_PORT}/tcp" || true
    firewall-cmd --permanent --add-port="${VBX_HTTPS_PORT}/tcp" || true
    # API наружу по умолчанию не рекламируем, но для локальной отладки открываем
    firewall-cmd --permanent --add-port="${VBX_API_PORT}/tcp" || true
    firewall-cmd --reload || true
    ok "Порты ${VBX_HTTP_PORT}/${VBX_HTTPS_PORT}/${VBX_API_PORT} tcp"
  else
    warn "firewalld не active"
  fi
}

compose() {
  ( cd "${APP_DIR}" && docker compose --env-file .env "$@" )
}

start_stack() {
  log "Сборка и запуск стека…"
  local profiles=()
  # MailHog в compose всегда есть; при no — останавливаем после up
  compose pull 2>&1 | tee -a "${LOG_FILE}" || warn "pull с предупреждениями"
  compose up -d --build 2>&1 | tee -a "${LOG_FILE}" || die "docker compose up не удался"
  if [[ "${VBX_MAILHOG}" != "yes" ]]; then
    compose stop mailhog 2>/dev/null || true
  fi
  ok "Контейнеры запущены"
  compose ps 2>&1 | tee -a "${LOG_FILE}"
}

wait_healthy() {
  log "Ожидание готовности (до ~4 мин)…"
  local i
  for i in $(seq 1 48); do
    if curl -fsS "http://127.0.0.1:${VBX_API_PORT}/ready" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:${VBX_HTTP_PORT}/login" >/dev/null 2>&1; then
      ok "API /ready и Web /login отвечают"
      return 0
    fi
    sleep 5
  done
  warn "Сервисы ещё не готовы — смотрите: cd ${APP_DIR} && docker compose logs --tail=100"
  compose ps 2>&1 | tee -a "${LOG_FILE}" || true
}

create_extra_users() {
  if [[ ! -s "${EXTRA_USERS_FILE}" ]]; then
    ok "Доп. УЗ не создавались"
    return
  fi
  log "Создание дополнительных УЗ…"
  local api_cid
  api_cid="$(cd "${APP_DIR}" && docker compose --env-file .env ps -q api | head -1)"
  if [[ -z "${api_cid}" ]]; then
    warn "Контейнер api не найден — доп. УЗ пропущены"
    return
  fi
  docker cp "${EXTRA_USERS_FILE}" "${api_cid}:/tmp/extra-users.tsv" \
    || { warn "Не удалось скопировать extra-users в api"; return; }

  compose exec -T api python - <<'PY' 2>&1 | tee -a "${LOG_FILE}" || warn "Создание доп. УЗ завершилось с ошибкой"
from pathlib import Path
from app.db import SessionLocal
from app.core.security import hash_password
from app.models import Role, User

path = Path("/tmp/extra-users.tsv")
if not path.exists():
    raise SystemExit(0)

db = SessionLocal()
try:
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) < 5:
            print(f"[skip] bad line: {line}")
            continue
        username, email, full_name, password, role_code = parts[:5]
        if db.query(User).filter((User.username == username) | (User.email == email)).first():
            print(f"[skip] exists: {username}")
            continue
        role = db.query(Role).filter_by(code=role_code).one_or_none()
        if not role:
            print(f"[skip] unknown role {role_code} for {username}")
            continue
        u = User(
            username=username,
            email=email,
            full_name=full_name or username,
            password_hash=hash_password(password),
            status="active",
            is_super_admin=False,
            organization="",
            title="",
            phone="",
        )
        u.roles.append(role)
        db.add(u)
        db.commit()
        print(f"[ok] created {username} role={role_code}")
finally:
    db.close()
PY
  ok "Доп. УЗ обработаны"
}

write_used_conf() {
  umask 077
  cat > "${VBX_INSTALL_DIR}/config/vbx.conf.used" <<EOF
# Snapshot of answers (без пароля Admin — он только в отчёте / vbx.env)
VBX_INSTALL_DIR="${VBX_INSTALL_DIR}"
VBX_HOST="${VBX_HOST}"
VBX_SCHEME="${VBX_SCHEME}"
VBX_HTTP_PORT="${VBX_HTTP_PORT}"
VBX_HTTPS_PORT="${VBX_HTTPS_PORT}"
VBX_API_PORT="${VBX_API_PORT}"
VBX_POSTGRES_DB="${VBX_POSTGRES_DB}"
VBX_POSTGRES_USER="${VBX_POSTGRES_USER}"
VBX_ADMIN_USERNAME="${VBX_ADMIN_USERNAME}"
VBX_ADMIN_EMAIL="${VBX_ADMIN_EMAIL}"
VBX_ADMIN_FULL_NAME="${VBX_ADMIN_FULL_NAME}"
VBX_ADMIN_ORG="${VBX_ADMIN_ORG}"
VBX_ADMIN_TITLE="${VBX_ADMIN_TITLE}"
VBX_ADMIN_PHONE="${VBX_ADMIN_PHONE}"
VBX_TIMEZONE="${VBX_TIMEZONE}"
VBX_SOURCE_MODE="${VBX_SOURCE_MODE}"
VBX_CONFIGURE_FIREWALL="${VBX_CONFIGURE_FIREWALL}"
EOF
  chmod 600 "${VBX_INSTALL_DIR}/config/vbx.conf.used"
}

write_report() {
  local finished url
  finished="$(date -Is)"
  url="$(public_url)"

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
Лог:             ${LOG_FILE}
Env:             ${VBX_INSTALL_DIR}/config/vbx.env
Conf snapshot:   ${VBX_INSTALL_DIR}/config/vbx.conf.used

--- Доступ -------------------------------------------------------------------
URL:             ${url}
Login page:      ${url}/login
API health:      http://${VBX_HOST}:${VBX_API_PORT}/health
API ready:       http://${VBX_HOST}:${VBX_API_PORT}/ready

--- СУПЕР-АДМИНИСТРАТОР (сохраните и смените после входа) --------------------
Логин:           ${VBX_ADMIN_USERNAME}
Email:           ${VBX_ADMIN_EMAIL}
Пароль:          ${VBX_ADMIN_PASSWORD}
ФИО:             ${VBX_ADMIN_FULL_NAME}
Организация:     ${VBX_ADMIN_ORG}
Должность:       ${VBX_ADMIN_TITLE}
Телефон:         ${VBX_ADMIN_PHONE}

--- PostgreSQL (Docker) ------------------------------------------------------
DB name:         ${VBX_POSTGRES_DB}
DB user:         ${VBX_POSTGRES_USER}
DB password:     ${VBX_POSTGRES_PASSWORD}
DSN (внутри):    postgresql+psycopg://${VBX_POSTGRES_USER}:***@postgres:5432/${VBX_POSTGRES_DB}

--- Redis --------------------------------------------------------------------
Password:        ${VBX_REDIS_PASSWORD}

--- Прочие секреты -----------------------------------------------------------
VBX_SECRET_KEY:  ${VBX_SECRET_KEY}
NVD API key:     ${VBX_NVD_API_KEY:-<не задан — Настройки → База данных>}

--- Дополнительные УЗ --------------------------------------------------------
EOF

  if [[ -s "${EXTRA_USERS_FILE}" ]]; then
    echo "(логин | email | ФИО | роль) — пароли задавались при установке и в отчёт не дублируются" >> "${REPORT_FILE}"
    awk -F'|' '{printf "  - %s <%s> — %s [%s]\n", $1, $2, $3, $5}' "${EXTRA_USERS_FILE}" >> "${REPORT_FILE}"
  else
    echo "(нет)" >> "${REPORT_FILE}"
  fi

  cat >> "${REPORT_FILE}" <<EOF

--- Docker -------------------------------------------------------------------
$(docker --version 2>/dev/null || echo 'docker n/a')
$(docker compose version 2>/dev/null || echo 'compose n/a')

$(cd "${APP_DIR}" && docker compose --env-file .env ps 2>/dev/null || true)

--- Команды ------------------------------------------------------------------
cd ${APP_DIR}
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=200
docker compose --env-file .env restart
bash ${APP_DIR}/deploy/redos/validate-install.sh

Бэкап:
  COMPOSE_DIR=${APP_DIR} VBX_BACKUP_DIR=${VBX_INSTALL_DIR}/backups bash ${APP_DIR}/scripts/backup.sh

--- Безопасность -------------------------------------------------------------
1) Файлы отчёта и vbx.env — mode 600. Не коммитьте и не шарьте в чатах.
2) Смените пароль Admin после первого входа (Профиль).
3) Для prod: HTTPS, VBX_TRUSTED_HOSTS, узкий VBX_CORS_ORIGINS, не публикуйте :${VBX_API_PORT}.
4) NVD key — в UI, если не задали при установке.
================================================================================
EOF
  chmod 600 "${REPORT_FILE}"
  ok "Отчёт: ${REPORT_FILE}"
}

print_summary() {
  local url
  url="$(public_url)"
  echo
  echo "================================================================================"
  echo -e "${C_GRN}${C_BOLD}VBXSystem: установка завершена${C_RST}"
  echo "================================================================================"
  echo -e "  URL:           ${C_BOLD}${url}${C_RST}"
  echo -e "  Login:         ${url}/login"
  echo
  echo -e "  ${C_BOLD}Admin логин:${C_RST}  ${VBX_ADMIN_USERNAME}"
  echo -e "  ${C_BOLD}Admin email:${C_RST}  ${VBX_ADMIN_EMAIL}"
  echo -e "  ${C_BOLD}Admin пароль:${C_RST} ${C_YEL}${VBX_ADMIN_PASSWORD}${C_RST}"
  echo
  echo "  PostgreSQL:    ${VBX_POSTGRES_USER} / ${VBX_POSTGRES_DB}  (пароль — в отчёте)"
  echo "  Redis:         пароль — в отчёте"
  if [[ -s "${EXTRA_USERS_FILE}" ]]; then
    echo "  Доп. УЗ:       $(wc -l < "${EXTRA_USERS_FILE}") (пароли заданы вами на этапе 7)"
  fi
  echo
  echo "  Отчёт:         ${REPORT_FILE}"
  echo "  Лог:           ${LOG_FILE}"
  echo "  Env:           ${VBX_INSTALL_DIR}/config/vbx.env"
  echo "================================================================================"
  echo -e "${C_YEL}Сохраните пароль Admin сейчас — он больше нигде не печатается.${C_RST}"
  echo
}

# =============================================================================
# main
# =============================================================================
main() {
  need_root

  echo
  echo -e "${C_BOLD}VBXSystem installer${C_RST}"
  echo "  $(date -Is)"
  echo

  if [[ -n "${CONF_FILE}" ]]; then
    load_conf_file
    # Даже из conf: если пароль Admin пустой или дефолтный — генерируем
    if [[ -z "${VBX_ADMIN_PASSWORD}" || "${VBX_ADMIN_PASSWORD}" == "ChangeMe_StrongPass_123!" ]]; then
      VBX_ADMIN_PASSWORD="$(rand_admin_password)"
      warn "Пароль Admin из conf пуст/дефолтный — сгенерирован новый"
    fi
    [[ -n "${VBX_HOST}" ]] || VBX_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -n "${VBX_HOST}" ]] || VBX_HOST="127.0.0.1"
    [[ -n "${VBX_ADMIN_EMAIL}" ]] || VBX_ADMIN_EMAIL="${VBX_ADMIN_USERNAME}@${VBX_HOST}"
    [[ -n "${VBX_ADMIN_FULL_NAME}" ]] || VBX_ADMIN_FULL_NAME="Главный Администратор"
    [[ -n "${VBX_ADMIN_ORG}" ]] || VBX_ADMIN_ORG="Организация"
  else
    wizard
  fi

  prepare_dirs
  log "Старт установки → ${VBX_INSTALL_DIR}"

  stage "Установка зависимостей хоста"
  detect_os
  install_host_packages
  install_docker

  stage "Размещение приложения и секретов"
  prepare_source
  write_env
  write_used_conf
  configure_firewall

  stage "Запуск Docker Compose"
  start_stack
  wait_healthy

  stage "Дополнительные учётные записи"
  create_extra_users

  stage "Финальный отчёт"
  write_report
  print_summary
}

main "$@"
