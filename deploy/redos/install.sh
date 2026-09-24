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
# Важно (до мелочей):
#   • Пароль супер-админа Admin ВСЕГДА генерируется установщиком
#     (даже если задан в conf) и выдаётся только в конце.
#   • На этапе Admin спрашиваются только профиль (логин/email/ФИО/…).
#   • PostgreSQL / Redis / VBX_SECRET_KEY: ввод или Enter = генерация.
#   • Доп. УЗ: явно имя + пароль (+ email/роль); пароль вводит оператор.
#   • Пароли в DSN URL-кодируются; .env пишется безопасно (mode 600).
#   • Финал: консоль + VBX_INSTALL_INFO.txt + проверка login Admin.
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
VBX_EXTRA_USERS_FILE="${VBX_EXTRA_USERS_FILE:-}"

# Флаги: что было сгенерировано (для отчёта)
GEN_POSTGRES=0
GEN_REDIS=0
GEN_SECRET=0
GEN_ADMIN=0
FRESH_VOLUMES=0
ADMIN_LOGIN_OK=0

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
VBX_PURGE_EXISTING="${VBX_PURGE_EXISTING:-ask}"

# Доп. пользователи: username|email|full_name|password|role
EXTRA_USERS=()
VALID_ROLES="admin analyst viewer ticket_manager"

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

# Hex-секрет (безопасен для URL и .env)
rand_secret() {
  local n="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${n}"
  else
    head -c "$((n * 2))" /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c "$((n * 2))"
  fi
}

# Читаемый пароль Admin (без неоднозначных символов O/0/l/1 и спецсимволов URL)
rand_admin_password() {
  local out=""
  if command -v openssl >/dev/null 2>&1; then
    out="$(openssl rand -base64 32 | tr -d '/+=0OIl1' | head -c 22)"
  else
    out="$(head -c 48 /dev/urandom | tr -dc 'A-HJ-NP-Za-km-z2-9' | head -c 22)"
  fi
  # Гарантируем длину и наличие буквы+цифры
  if [[ ${#out} -lt 16 ]]; then
    out="$(rand_secret 12)"
  fi
  printf '%s' "${out}"
}

# URL-encode для DSN (python3 предпочтительно)
urlencode() {
  local raw="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$raw"
  else
    # fallback: только безопасный hex/alnum
    printf '%s' "$raw" | sed 's/./&/g' | while IFS= read -r -n1 c; do
      case "$c" in
        [a-zA-Z0-9.~_-]) printf '%s' "$c" ;;
        *) printf '%%%02X' "'$c" ;;
      esac
    done
  fi
}

# Безопасная запись KEY=value в .env (экранирование через python)
env_write_pair() {
  local file="$1" key="$2" val="$3"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$file" "$key" "$val" <<'PY'
import sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
# docker compose .env: double-quote + escape \, ", $, newline
escaped = (
    val.replace("\\", "\\\\")
       .replace('"', '\\"')
       .replace("$", "\\$")
       .replace("\n", "\\n")
)
with open(path, "a", encoding="utf-8") as f:
    f.write(f'{key}="{escaped}"\n')
PY
  else
    # fallback: запрещаем опасные символы
    if [[ "$val" =~ [\"\'\$\`\\[:space:]] ]]; then
      die "Значение ${key} содержит спецсимволы, а python3 недоступен для экранирования"
    fi
    printf '%s="%s"\n' "$key" "$val" >> "$file"
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

# Результат последнего prompt_password_* (избегаем subshell из $())
_LAST_SECRET=""
_LAST_SECRET_GENERATED=0

prompt_password() {
  # $1 prompt, $2 allow empty generate (1/0)
  # Пишет в _LAST_SECRET / _LAST_SECRET_GENERATED (не stdout — иначе флаги теряются в $())
  local prompt="$1" allow_gen="${2:-1}" a="" b=""
  _LAST_SECRET=""
  _LAST_SECRET_GENERATED=0
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    if [[ "$allow_gen" == "1" ]]; then
      _LAST_SECRET="$(rand_secret 16)"
      _LAST_SECRET_GENERATED=1
      return 0
    fi
    return 1
  fi
  while true; do
    if [[ "$allow_gen" == "1" ]]; then
      read -r -s -p "$prompt (Enter = сгенерировать): " a || true
    else
      read -r -s -p "$prompt: " a || true
    fi
    echo
    if [[ -z "$a" && "$allow_gen" == "1" ]]; then
      _LAST_SECRET="$(rand_secret 16)"
      _LAST_SECRET_GENERATED=1
      echo "  → сгенерирован надёжный пароль (hex, 32 символа)"
      return 0
    fi
    if [[ -z "$a" ]]; then
      echo "  пустой пароль не допускается"
      continue
    fi
    if [[ ${#a} -lt 10 ]]; then
      echo "  минимум 10 символов (сейчас ${#a})"
      continue
    fi
    if [[ "$a" =~ [[:space:]] ]]; then
      echo "  пробелы в пароле не допускаются"
      continue
    fi
    read -r -s -p "  Повторите пароль: " b || true
    echo
    if [[ "$a" != "$b" ]]; then
      echo "  не совпадают — ещё раз"
      continue
    fi
    _LAST_SECRET="$a"
    _LAST_SECRET_GENERATED=0
    return 0
  done
}

confirm() {
  local prompt="$1" default="${2:-y}" ans=""
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    # Без TTY уважаем default (y → да, n → нет)
    [[ "$default" =~ ^[YyДд] ]]
    return
  fi
  read -r -p "$prompt [${default}/n]: " ans || true
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[YyДд] ]]
}

prompt_yes_no() {
  local prompt="$1" default="${2:-yes}" ans="" norm=""
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    printf '%s' "$default"
    return
  fi
  while true; do
    read -r -p "$prompt [${default}]: " ans || true
    ans="${ans:-$default}"
    norm="$(printf '%s' "$ans" | tr '[:upper:]' '[:lower:]')"
    case "${norm}" in
      y|yes|д|да) printf 'yes'; return ;;
      n|no|н|нет) printf 'no'; return ;;
      *) echo "  введите yes или no" >&2 ;;
    esac
  done
}

prompt_choice() {
  local prompt="$1" allowed="$2" default="${3:-}" val=""
  if [[ "${ASSUME_YES}" == "1" ]] || ! have_tty; then
    printf '%s' "$default"
    return
  fi
  while true; do
    if [[ -n "$default" ]]; then
      read -r -p "$prompt [${default}]: " val || true
    else
      read -r -p "$prompt: " val || true
    fi
    val="${val:-$default}"
    for item in $allowed; do
      if [[ "$val" == "$item" ]]; then
        printf '%s' "$val"
        return
      fi
    done
    echo "  допустимо: ${allowed}" >&2
  done
}

valid_ident() {
  [[ "$1" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]]
}

valid_email() {
  [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]
}

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 1 <= $1 && $1 <= 65535 ))
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

role_ok() {
  local r="$1"
  for item in $VALID_ROLES; do
    [[ "$r" == "$item" ]] && return 0
  done
  return 1
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

  # Доп. УЗ из файла (tsv: username|email|full_name|password|role)
  if [[ -n "${VBX_EXTRA_USERS_FILE}" && -f "${VBX_EXTRA_USERS_FILE}" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
      EXTRA_USERS+=("$line")
    done < "${VBX_EXTRA_USERS_FILE}"
    ok "Доп. УЗ из файла: ${#EXTRA_USERS[@]} шт. (${VBX_EXTRA_USERS_FILE})"
  fi
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
  cat <<EOF
Установщик VBXSystem на РЕД ОС / RHEL-like (Docker Compose).

Как устроен мастер:
  • Каждый этап запрашивает только свои данные (сеть → БД → Redis → УЗ …).
  • Пароль Admin НЕ спрашивается — генерируется в конце и печатается один раз.
  • Пароли PostgreSQL / Redis / SECRET_KEY: ввод или Enter = генерация.
  • Доп. УЗ (аналитик и т.п.): логин, ФИО, роль и пароль — вручную.
EOF
  echo
  confirm "Продолжить установку?" "y" || die "Отменено пользователем"

  # --- существующая установка ---
  if [[ -d "${VBX_INSTALL_DIR}/app" ]] || docker volume ls --format '{{.Name}}' 2>/dev/null | grep -qE 'vbx_pg|vbxsystem_vbx_pg'; then
    stage "Этап 0b · Обнаружена предыдущая установка"
    echo "Каталог/volumes VBX уже есть. Повторная установка без очистки volumes"
    echo "оставит старого Admin в БД — новый пароль из отчёта НЕ подойдёт."
    echo
    local purge
    if [[ "${VBX_PURGE_EXISTING}" == "yes" ]]; then
      purge="yes"
    elif [[ "${VBX_PURGE_EXISTING}" == "no" ]]; then
      purge="no"
    else
      purge="$(prompt_yes_no "Удалить volumes и начать с чистой БД? (рекомендуется)" "yes")"
    fi
    if [[ "$purge" == "yes" ]]; then
      FRESH_VOLUMES=1
      ok "Будет выполнена очистка volumes перед запуском"
    else
      warn "Volumes сохраняются — пароль Admin из отчёта может не совпасть с БД"
    fi
  fi

  stage "Этап 1 · Сеть и URL"
  local detect_host
  detect_host="$(hostname -I 2>/dev/null | awk '{print $1}')"
  detect_host="${detect_host:-$(hostname -f 2>/dev/null || hostname || echo 127.0.0.1)}"
  VBX_HOST="$(prompt_line "IP или DNS сервера (как открывают пользователи)" "${VBX_HOST:-$detect_host}")"
  [[ -n "${VBX_HOST}" ]] || die "Хост обязателен"
  [[ ! "${VBX_HOST}" =~ [[:space:]] ]] || die "Хост не должен содержать пробелы"

  VBX_SCHEME="$(prompt_choice "Схема (http|https)" "http https" "${VBX_SCHEME}")"
  VBX_HTTP_PORT="$(prompt_line "HTTP порт web" "${VBX_HTTP_PORT}")"
  valid_port "${VBX_HTTP_PORT}" || die "Некорректный HTTP порт: ${VBX_HTTP_PORT}"
  VBX_HTTPS_PORT="$(prompt_line "HTTPS порт" "${VBX_HTTPS_PORT}")"
  valid_port "${VBX_HTTPS_PORT}" || die "Некорректный HTTPS порт: ${VBX_HTTPS_PORT}"
  VBX_API_PORT="$(prompt_line "Порт API (обычно localhost)" "${VBX_API_PORT}")"
  valid_port "${VBX_API_PORT}" || die "Некорректный API порт: ${VBX_API_PORT}"

  if [[ "${VBX_SCHEME}" == "https" ]]; then
    VBX_TLS_CERT_PATH="$(prompt_line "Путь к TLS certificate (fullchain.pem)" "${VBX_TLS_CERT_PATH}")"
    VBX_TLS_KEY_PATH="$(prompt_line "Путь к TLS private key (privkey.pem)" "${VBX_TLS_KEY_PATH}")"
    if [[ -n "${VBX_TLS_CERT_PATH}" && ! -f "${VBX_TLS_CERT_PATH}" ]]; then
      warn "Файл сертификата не найден: ${VBX_TLS_CERT_PATH}"
    fi
    if [[ -n "${VBX_TLS_KEY_PATH}" && ! -f "${VBX_TLS_KEY_PATH}" ]]; then
      warn "Файл ключа не найден: ${VBX_TLS_KEY_PATH}"
    fi
  fi

  stage "Этап 2 · Каталоги установки"
  VBX_INSTALL_DIR="$(prompt_line "Каталог установки" "${VBX_INSTALL_DIR}")"
  [[ "${VBX_INSTALL_DIR}" = /* ]] || die "Каталог установки должен быть абсолютным путём"
  VBX_SOURCE_MODE="$(prompt_choice "Источник кода (local|archive)" "local archive" "${VBX_SOURCE_MODE}")"
  if [[ "${VBX_SOURCE_MODE}" == "archive" ]]; then
    VBX_ARCHIVE_PATH="$(prompt_line "Путь к tar.gz релиза" "${VBX_ARCHIVE_PATH}")"
    [[ -n "${VBX_ARCHIVE_PATH}" ]] || die "Укажите путь к архиву"
  else
    VBX_REPO_PATH="$(prompt_line "Путь к репозиторию (пусто = этот clone)" "${VBX_REPO_PATH:-$REPO_ROOT}")"
  fi

  stage "Этап 3 · База данных PostgreSQL (контейнер)"
  cat <<EOF
PostgreSQL поднимается в Docker Compose (не системный postgres хоста).
Нужны: имя БД, роль (пользователь) и пароль этой роли.
EOF
  echo
  VBX_POSTGRES_DB="$(prompt_line "Имя базы" "${VBX_POSTGRES_DB}")"
  VBX_POSTGRES_USER="$(prompt_line "Роль (пользователь) БД" "${VBX_POSTGRES_USER}")"
  valid_ident "${VBX_POSTGRES_DB}" || die "Имя БД: [A-Za-z_][A-Za-z0-9_]{0,62}"
  valid_ident "${VBX_POSTGRES_USER}" || die "Роль БД: [A-Za-z_][A-Za-z0-9_]{0,62}"
  echo
  echo "Пароль роли «${VBX_POSTGRES_USER}»:"
  if [[ -z "${VBX_POSTGRES_PASSWORD}" ]]; then
    prompt_password "  Пароль PostgreSQL" 1 || die "Пароль PostgreSQL пуст"
    VBX_POSTGRES_PASSWORD="${_LAST_SECRET}"
    GEN_POSTGRES="${_LAST_SECRET_GENERATED}"
  else
    ok "Пароль PostgreSQL уже задан (env/conf) — оставляем"
  fi
  [[ -n "${VBX_POSTGRES_PASSWORD}" ]] || die "Пароль PostgreSQL пуст"
  [[ ${#VBX_POSTGRES_PASSWORD} -ge 10 ]] || die "Пароль PostgreSQL короче 10 символов"

  stage "Этап 4 · Redis"
  echo "Пароль Redis (requirepass в контейнере):"
  if [[ -z "${VBX_REDIS_PASSWORD}" ]]; then
    prompt_password "  Пароль Redis" 1 || die "Пароль Redis пуст"
    VBX_REDIS_PASSWORD="${_LAST_SECRET}"
    GEN_REDIS="${_LAST_SECRET_GENERATED}"
  else
    ok "Пароль Redis уже задан (env/conf) — оставляем"
  fi
  [[ -n "${VBX_REDIS_PASSWORD}" ]] || die "Пароль Redis пуст"
  [[ ${#VBX_REDIS_PASSWORD} -ge 10 ]] || die "Пароль Redis короче 10 символов"

  stage "Этап 5 · Секрет приложения (JWT / cookies)"
  echo "VBX_SECRET_KEY подписывает JWT и сессии. Не делитесь им."
  if [[ -z "${VBX_SECRET_KEY}" ]]; then
    if confirm "Сгенерировать VBX_SECRET_KEY автоматически?" "y"; then
      VBX_SECRET_KEY="$(rand_secret 32)"
      GEN_SECRET=1
      ok "SECRET_KEY сгенерирован"
    else
      prompt_password "  VBX_SECRET_KEY" 1 || die "VBX_SECRET_KEY пуст"
      VBX_SECRET_KEY="${_LAST_SECRET}"
      GEN_SECRET="${_LAST_SECRET_GENERATED}"
    fi
  else
    ok "SECRET_KEY уже задан (env/conf)"
  fi
  [[ -n "${VBX_SECRET_KEY}" ]] || die "VBX_SECRET_KEY пуст"
  [[ ${#VBX_SECRET_KEY} -ge 16 ]] || die "VBX_SECRET_KEY слишком короткий (мин. 16)"

  stage "Этап 6 · Организация и локаль"
  VBX_ADMIN_ORG="$(prompt_line "Название организации" "${VBX_ADMIN_ORG:-ООО Пример}")"
  [[ -n "${VBX_ADMIN_ORG}" ]] || die "Организация обязательна"
  VBX_TIMEZONE="$(prompt_line "Часовой пояс" "${VBX_TIMEZONE}")"

  stage "Этап 7 · Учётная запись Admin (пароль сгенерируется в конце)"
  cat <<EOF
Сейчас — только профиль супер-администратора.
Пароль НЕ вводится: установщик сгенерирует его сам после поднятия стека
и покажет в финальном отчёте (консоль + VBX_INSTALL_INFO.txt).
EOF
  echo
  VBX_ADMIN_USERNAME="$(prompt_line "Логин Admin" "${VBX_ADMIN_USERNAME}")"
  valid_ident "${VBX_ADMIN_USERNAME}" || die "Логин Admin: [A-Za-z_][A-Za-z0-9_]{0,62}"
  VBX_ADMIN_EMAIL="$(prompt_line "Email Admin" "${VBX_ADMIN_EMAIL:-${VBX_ADMIN_USERNAME}@${VBX_HOST}}")"
  valid_email "${VBX_ADMIN_EMAIL}" || die "Некорректный email: ${VBX_ADMIN_EMAIL}"
  VBX_ADMIN_FULL_NAME="$(prompt_line "ФИО Admin" "${VBX_ADMIN_FULL_NAME:-Главный Администратор}")"
  [[ -n "${VBX_ADMIN_FULL_NAME}" ]] || die "ФИО Admin обязательно"
  VBX_ADMIN_TITLE="$(prompt_line "Должность" "${VBX_ADMIN_TITLE}")"
  VBX_ADMIN_PHONE="$(prompt_line "Телефон (опционально)" "${VBX_ADMIN_PHONE}")"
  # Пароль намеренно НЕ генерируем здесь — только в конце (generate_admin_password)
  VBX_ADMIN_PASSWORD=""
  ok "Профиль Admin принят; пароль будет сгенерирован в финале"

  stage "Этап 8 · Дополнительная учётная запись (опционально)"
  EXTRA_USERS=()
  if confirm "Создать ещё одну УЗ (например аналитика)?" "n"; then
    while true; do
      local eu_user eu_email eu_name eu_pass eu_role
      echo
      echo "  —— новая УЗ ——"
      eu_user="$(prompt_line "  Логин" "analyst")"
      if ! valid_ident "${eu_user}"; then
        warn "Некорректный логин (нужен [A-Za-z_][A-Za-z0-9_]*)"
        continue
      fi
      if [[ "${eu_user}" == "${VBX_ADMIN_USERNAME}" ]]; then
        warn "Логин совпадает с Admin — выберите другой"
        continue
      fi
      eu_email="$(prompt_line "  Email" "${eu_user}@${VBX_HOST}")"
      if ! valid_email "${eu_email}"; then
        warn "Некорректный email"
        continue
      fi
      if [[ "${eu_email}" == "${VBX_ADMIN_EMAIL}" ]]; then
        warn "Email совпадает с Admin — выберите другой"
        continue
      fi
      eu_name="$(prompt_line "  ФИО (имя пользователя)" "Аналитик ИБ")"
      [[ -n "${eu_name}" ]] || { warn "ФИО обязательно"; continue; }
      eu_role="$(prompt_choice "  Роль (${VALID_ROLES})" "${VALID_ROLES}" "analyst")"
      echo "  Пароль для «${eu_user}» (обязателен — введите сами, Enter≠генерация):"
      if ! prompt_password "  Пароль ${eu_user}" 0; then
        warn "Пароль обязателен"
        continue
      fi
      eu_pass="${_LAST_SECRET}"
      [[ -n "${eu_pass}" ]] || { warn "Пароль обязателен"; continue; }
      EXTRA_USERS+=("${eu_user}|${eu_email}|${eu_name}|${eu_pass}|${eu_role}")
      ok "Доп. УЗ запланирована: ${eu_user} / ${eu_name} (${eu_role})"
      confirm "Добавить ещё одну УЗ?" "n" || break
    done
  else
    ok "Доп. УЗ пропускаем"
  fi

  stage "Этап 9 · Источники данных (опционально)"
  VBX_NVD_API_KEY="$(prompt_line "NVD API key (пусто = задать позже в UI → База данных)" "${VBX_NVD_API_KEY}")"

  stage "Этап 10 · Система / firewall / Docker"
  VBX_CONFIGURE_FIREWALL="$(prompt_yes_no "Открыть порты в firewalld?" "${VBX_CONFIGURE_FIREWALL}")"
  VBX_ADD_USER_TO_DOCKER="$(prompt_yes_no "Добавить ${INSTALL_USER} в группу docker?" "${VBX_ADD_USER_TO_DOCKER}")"
  VBX_DOCKER_SMOKE_TEST="$(prompt_yes_no "Smoke-test hello-world?" "${VBX_DOCKER_SMOKE_TEST}")"
  VBX_DNF_UPDATE="$(prompt_yes_no "Выполнить dnf update? (обычно no)" "${VBX_DNF_UPDATE}")"
  VBX_MAILHOG="$(prompt_yes_no "Поднять MailHog для SMTP-тестов?" "${VBX_MAILHOG}")"

  stage "Сводка перед установкой"
  cat <<EOF
  Хост:            ${VBX_HOST}
  URL:             $(public_url)
  Каталог:         ${VBX_INSTALL_DIR}
  Источник:        ${VBX_SOURCE_MODE}
  PostgreSQL:      ${VBX_POSTGRES_USER}@/${VBX_POSTGRES_DB}  (пароль: $([ "${GEN_POSTGRES}" = 1 ] && echo сгенерирован || echo задан вами))
  Redis:           пароль $([ "${GEN_REDIS}" = 1 ] && echo сгенерирован || echo задан вами)
  SECRET_KEY:      $([ "${GEN_SECRET}" = 1 ] && echo сгенерирован || echo задан)
  Admin логин:     ${VBX_ADMIN_USERNAME}  <${VBX_ADMIN_EMAIL}>
  Admin ФИО:       ${VBX_ADMIN_FULL_NAME}
  Admin пароль:    *** будет сгенерирован и показан ТОЛЬКО в конце ***
  Организация:     ${VBX_ADMIN_ORG}
  Доп. УЗ:         ${#EXTRA_USERS[@]} шт.
  NVD key:         ${VBX_NVD_API_KEY:+задан}${VBX_NVD_API_KEY:-не задан}
  Firewall:        ${VBX_CONFIGURE_FIREWALL}
  MailHog:         ${VBX_MAILHOG}
  Чистые volumes:  $([ "${FRESH_VOLUMES}" = 1 ] && echo да || echo нет)
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
  chmod 600 "${LOG_FILE}"
  if [[ "${VBX_INSTALL_REPORT}" = /* ]]; then
    REPORT_FILE="${VBX_INSTALL_REPORT}"
  else
    REPORT_FILE="${VBX_INSTALL_DIR}/${VBX_INSTALL_REPORT}"
  fi
  EXTRA_USERS_FILE="${VBX_INSTALL_DIR}/config/extra-users.tsv"
  : > "${EXTRA_USERS_FILE}"
  chmod 600 "${EXTRA_USERS_FILE}"
  local line
  if ((${#EXTRA_USERS[@]})); then
    for line in "${EXTRA_USERS[@]}"; do
      [[ -n "${line}" ]] || continue
      printf '%s\n' "${line}" >> "${EXTRA_USERS_FILE}"
    done
  fi
}

# =============================================================================
# ОС / Docker / код
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
  command -v python3 >/dev/null 2>&1 || warn "python3 желателен (экранирование .env / urlencode)"
}

install_host_packages() {
  log "Установка базовых пакетов…"
  dnf -y install \
    ca-certificates curl wget tar gzip unzip git openssl jq python3 \
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
          --exclude '.env' \
          "${src}/" "${VBX_INSTALL_DIR}/app/"
      else
        tar -C "${src}" --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='.env' -cf - . \
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

  # TLS: копируем в certs/ (для будущего reverse-proxy / документации)
  if [[ -n "${VBX_TLS_CERT_PATH}" && -f "${VBX_TLS_CERT_PATH}" ]]; then
    cp -a "${VBX_TLS_CERT_PATH}" "${VBX_INSTALL_DIR}/certs/fullchain.pem"
    chmod 644 "${VBX_INSTALL_DIR}/certs/fullchain.pem"
  fi
  if [[ -n "${VBX_TLS_KEY_PATH}" && -f "${VBX_TLS_KEY_PATH}" ]]; then
    cp -a "${VBX_TLS_KEY_PATH}" "${VBX_INSTALL_DIR}/certs/privkey.pem"
    chmod 600 "${VBX_INSTALL_DIR}/certs/privkey.pem"
  fi
}

generate_admin_password() {
  stage "Генерация пароля Admin"
  VBX_ADMIN_PASSWORD="$(rand_admin_password)"
  GEN_ADMIN=1
  ok "Пароль Admin сгенерирован (будет показан только в финальном отчёте)"
}

write_env() {
  log "Запись секретов и .env…"
  [[ -n "${VBX_SECRET_KEY}" ]] || { VBX_SECRET_KEY="$(rand_secret 32)"; GEN_SECRET=1; }
  [[ -n "${VBX_POSTGRES_PASSWORD}" ]] || { VBX_POSTGRES_PASSWORD="$(rand_secret 16)"; GEN_POSTGRES=1; }
  [[ -n "${VBX_REDIS_PASSWORD}" ]] || { VBX_REDIS_PASSWORD="$(rand_secret 16)"; GEN_REDIS=1; }
  [[ -n "${VBX_ADMIN_PASSWORD}" ]] || generate_admin_password

  local url enc_user enc_pass enc_db
  url="$(public_url)"
  enc_user="$(urlencode "${VBX_POSTGRES_USER}")"
  enc_pass="$(urlencode "${VBX_POSTGRES_PASSWORD}")"
  enc_db="$(urlencode "${VBX_POSTGRES_DB}")"
  local enc_redis
  enc_redis="$(urlencode "${VBX_REDIS_PASSWORD}")"

  umask 077
  local env_path="${VBX_INSTALL_DIR}/config/vbx.env"
  : > "${env_path}"
  {
    echo "# Generated by deploy/redos/install.sh on ${STARTED_AT}"
    echo "# DO NOT COMMIT — mode 600"
    echo
  } >> "${env_path}"

  env_write_pair "${env_path}" VBX_HOST "${VBX_HOST}"
  env_write_pair "${env_path}" VBX_SCHEME "${VBX_SCHEME}"
  env_write_pair "${env_path}" VBX_HTTP_PORT "${VBX_HTTP_PORT}"
  env_write_pair "${env_path}" VBX_HTTPS_PORT "${VBX_HTTPS_PORT}"
  env_write_pair "${env_path}" VBX_API_PORT "${VBX_API_PORT}"
  env_write_pair "${env_path}" VBX_PUBLIC_URL "${url}"
  env_write_pair "${env_path}" VBX_SECRET_KEY "${VBX_SECRET_KEY}"
  env_write_pair "${env_path}" VBX_POSTGRES_DB "${VBX_POSTGRES_DB}"
  env_write_pair "${env_path}" VBX_POSTGRES_USER "${VBX_POSTGRES_USER}"
  env_write_pair "${env_path}" VBX_POSTGRES_PASSWORD "${VBX_POSTGRES_PASSWORD}"
  env_write_pair "${env_path}" VBX_REDIS_PASSWORD "${VBX_REDIS_PASSWORD}"
  env_write_pair "${env_path}" VBX_NVD_API_KEY "${VBX_NVD_API_KEY}"
  env_write_pair "${env_path}" VBX_ADMIN_USERNAME "${VBX_ADMIN_USERNAME}"
  env_write_pair "${env_path}" VBX_ADMIN_EMAIL "${VBX_ADMIN_EMAIL}"
  env_write_pair "${env_path}" VBX_ADMIN_PASSWORD "${VBX_ADMIN_PASSWORD}"
  env_write_pair "${env_path}" VBX_ADMIN_FULL_NAME "${VBX_ADMIN_FULL_NAME}"
  env_write_pair "${env_path}" VBX_ADMIN_ORG "${VBX_ADMIN_ORG}"
  env_write_pair "${env_path}" VBX_ADMIN_TITLE "${VBX_ADMIN_TITLE}"
  env_write_pair "${env_path}" VBX_ADMIN_PHONE "${VBX_ADMIN_PHONE}"
  env_write_pair "${env_path}" VBX_TIMEZONE "${VBX_TIMEZONE}"
  env_write_pair "${env_path}" VBX_POSTGRES_MEM_LIMIT "${VBX_POSTGRES_MEM_LIMIT}"
  env_write_pair "${env_path}" VBX_API_MEM_LIMIT "${VBX_API_MEM_LIMIT}"
  env_write_pair "${env_path}" VBX_WEB_MEM_LIMIT "${VBX_WEB_MEM_LIMIT}"
  env_write_pair "${env_path}" TZ "${VBX_TIMEZONE}"
  env_write_pair "${env_path}" VBX_CORS_ORIGINS "${url},http://127.0.0.1,http://localhost"
  env_write_pair "${env_path}" VBX_API_INTERNAL_URL "http://api:8000"
  env_write_pair "${env_path}" VBX_DATABASE_URL "postgresql+psycopg://${enc_user}:${enc_pass}@postgres:5432/${enc_db}"
  env_write_pair "${env_path}" VBX_REDIS_URL "redis://:${enc_redis}@redis:6379/0"

  cp -a "${env_path}" "${APP_DIR}/.env"
  chmod 600 "${env_path}" "${APP_DIR}/.env"
  ok ".env записан (mode 600, значения экранированы)"
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

maybe_purge_volumes() {
  if [[ "${FRESH_VOLUMES}" != "1" ]]; then
    return
  fi
  log "Очистка предыдущего стека и volumes…"
  if [[ -f "${APP_DIR}/docker-compose.yml" ]]; then
    compose down -v 2>&1 | tee -a "${LOG_FILE}" || true
  fi
  # На случай если app ещё не скопирован, а volumes от прошлого compose-проекта остались
  docker volume ls -q | grep -E 'vbx_pg|vbx_redis|vbx_uploads' | while read -r vol; do
    docker volume rm -f "$vol" 2>/dev/null || true
  done
  ok "Volumes очищены"
}

start_stack() {
  log "Сборка и запуск стека…"
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

verify_admin_login() {
  log "Проверка входа Admin через API…"
  local resp code
  resp="$(curl -sS -o /tmp/vbx-login-check.json -w '%{http_code}' \
    -X POST "http://127.0.0.1:${VBX_API_PORT}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${VBX_ADMIN_USERNAME}\",\"password\":\"${VBX_ADMIN_PASSWORD}\"}" \
    2>/dev/null || echo "000")"
  code="${resp: -3}"
  if [[ "${code}" == "200" ]]; then
    ADMIN_LOGIN_OK=1
    ok "Admin login OK (HTTP 200)"
    rm -f /tmp/vbx-login-check.json
    return 0
  fi
  warn "Admin login не подтверждён (HTTP ${code}). Возможна старая БД без сброса volumes."
  if [[ -f /tmp/vbx-login-check.json ]]; then
    head -c 400 /tmp/vbx-login-check.json | tee -a "${LOG_FILE}" || true
    echo | tee -a "${LOG_FILE}"
    rm -f /tmp/vbx-login-check.json
  fi
  return 0
}

sync_admin_password() {
  # Гарантируем, что сгенерированный пароль Admin совпадает с БД
  # (seed не обновляет пароль уже существующего пользователя).
  log "Синхронизация пароля Admin в БД…"
  compose exec -T api python - <<PY 2>&1 | tee -a "${LOG_FILE}" || warn "sync Admin password failed"
import os
from app.db import SessionLocal
from app.core.security import hash_password
from app.models import User, Role

username = os.environ.get("VBX_ADMIN_USERNAME", "admin")
password = os.environ.get("VBX_ADMIN_PASSWORD", "")
email = os.environ.get("VBX_ADMIN_EMAIL", "")
full_name = os.environ.get("VBX_ADMIN_FULL_NAME", "")
org = os.environ.get("VBX_ADMIN_ORG", "")
title = os.environ.get("VBX_ADMIN_TITLE", "")
phone = os.environ.get("VBX_ADMIN_PHONE", "")

if not password:
    raise SystemExit("empty VBX_ADMIN_PASSWORD")

db = SessionLocal()
try:
    user = db.query(User).filter_by(username=username).one_or_none()
    role = db.query(Role).filter_by(code="super_admin").one()
    if not user:
        user = User(
            username=username,
            email=email or f"{username}@localhost",
            password_hash=hash_password(password),
            full_name=full_name or username,
            organization=org or "",
            title=title or "",
            phone=phone or "",
            status="active",
            is_super_admin=True,
        )
        user.roles.append(role)
        db.add(user)
        print(f"[ok] created admin {username}")
    else:
        user.password_hash = hash_password(password)
        user.email = email or user.email
        user.full_name = full_name or user.full_name
        user.organization = org or user.organization
        user.title = title or user.title
        user.phone = phone or user.phone
        user.status = "active"
        user.is_super_admin = True
        if role not in user.roles:
            user.roles.append(role)
        print(f"[ok] updated admin {username} password+profile")
    db.commit()
finally:
    db.close()
PY
  ok "Пароль Admin синхронизирован с БД"
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

allowed = {"admin", "analyst", "viewer", "ticket_manager"}
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
        username, email, full_name, password, role_code = [p.strip() for p in parts[:5]]
        if role_code not in allowed:
            print(f"[skip] unknown role {role_code} for {username}")
            continue
        if db.query(User).filter((User.username == username) | (User.email == email)).first():
            print(f"[skip] exists: {username}")
            continue
        role = db.query(Role).filter_by(code=role_code).one_or_none()
        if not role:
            print(f"[skip] role missing in DB: {role_code}")
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
    try:
        path.unlink(missing_ok=True)
    except TypeError:
        path.unlink() if path.exists() else None
PY

  # Стираем пароли из локального tsv (оставляем метаданные)
  if [[ -s "${EXTRA_USERS_FILE}" ]]; then
    local scrubbed="${EXTRA_USERS_FILE}.meta"
    awk -F'|' 'NF>=5 {printf "%s|%s|%s|***|%s\n", $1, $2, $3, $5}' "${EXTRA_USERS_FILE}" > "${scrubbed}"
    mv -f "${scrubbed}" "${EXTRA_USERS_FILE}"
    chmod 600 "${EXTRA_USERS_FILE}"
  fi
  ok "Доп. УЗ обработаны (пароли убраны из extra-users.tsv)"
}

write_used_conf() {
  umask 077
  cat > "${VBX_INSTALL_DIR}/config/vbx.conf.used" <<EOF
# Snapshot ответов мастера (без паролей — они только в отчёте / vbx.env)
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
VBX_MAILHOG="${VBX_MAILHOG}"
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
Admin login API: $([ "${ADMIN_LOGIN_OK}" = 1 ] && echo OK || echo не подтверждён)

--- Доступ -------------------------------------------------------------------
URL:             ${url}
Login page:      ${url}/login
API health:      http://127.0.0.1:${VBX_API_PORT}/health
API ready:       http://127.0.0.1:${VBX_API_PORT}/ready

--- СУПЕР-АДМИНИСТРАТОР (сохраните и смените после входа) --------------------
Логин:           ${VBX_ADMIN_USERNAME}
Email:           ${VBX_ADMIN_EMAIL}
Пароль:          ${VBX_ADMIN_PASSWORD}
ФИО:             ${VBX_ADMIN_FULL_NAME}
Организация:     ${VBX_ADMIN_ORG}
Должность:       ${VBX_ADMIN_TITLE}
Телефон:         ${VBX_ADMIN_PHONE}
Источник пароля: сгенерирован установщиком ($([ "${GEN_ADMIN}" = 1 ] && echo да || echo нет))

--- PostgreSQL (Docker) ------------------------------------------------------
DB name:         ${VBX_POSTGRES_DB}
DB user:         ${VBX_POSTGRES_USER}
DB password:     ${VBX_POSTGRES_PASSWORD}
Источник пароля: $([ "${GEN_POSTGRES}" = 1 ] && echo сгенерирован || echo задан оператором)
DSN (внутри):    postgresql+psycopg://${VBX_POSTGRES_USER}:***@postgres:5432/${VBX_POSTGRES_DB}

--- Redis --------------------------------------------------------------------
Password:        ${VBX_REDIS_PASSWORD}
Источник:        $([ "${GEN_REDIS}" = 1 ] && echo сгенерирован || echo задан оператором)

--- Прочие секреты -----------------------------------------------------------
VBX_SECRET_KEY:  ${VBX_SECRET_KEY}
Источник:        $([ "${GEN_SECRET}" = 1 ] && echo сгенерирован || echo задан)
NVD API key:     ${VBX_NVD_API_KEY:-<не задан — Настройки → База данных>}

--- Дополнительные УЗ --------------------------------------------------------
EOF

  if [[ -s "${EXTRA_USERS_FILE}" ]]; then
    echo "(логин | email | ФИО | роль) — пароли задавались при установке и здесь не дублируются" >> "${REPORT_FILE}"
    awk -F'|' 'NF>=5 {printf "  - %s <%s> — %s [%s]\n", $1, $2, $3, $5}' "${EXTRA_USERS_FILE}" >> "${REPORT_FILE}"
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
5) При повторной установке без очистки volumes пароль Admin в БД не обновится.
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
  echo -e "  URL:              ${C_BOLD}${url}${C_RST}"
  echo -e "  Страница входа:   ${url}/login"
  echo -e "  API ready:        http://127.0.0.1:${VBX_API_PORT}/ready"
  echo
  echo -e "  ${C_BOLD}—— Супер-администратор ——${C_RST}"
  echo -e "  Логин:            ${C_BOLD}${VBX_ADMIN_USERNAME}${C_RST}"
  echo -e "  Email:            ${VBX_ADMIN_EMAIL}"
  echo -e "  ФИО:              ${VBX_ADMIN_FULL_NAME}"
  echo -e "  Пароль:           ${C_YEL}${C_BOLD}${VBX_ADMIN_PASSWORD}${C_RST}"
  if [[ "${ADMIN_LOGIN_OK}" == "1" ]]; then
    echo -e "  Проверка входа:   ${C_GRN}OK${C_RST}"
  else
    echo -e "  Проверка входа:   ${C_YEL}не подтверждена${C_RST} (см. лог / volumes)"
  fi
  echo
  echo -e "  ${C_BOLD}—— Инфраструктура (также в отчёте) ——${C_RST}"
  echo "  PostgreSQL:       ${VBX_POSTGRES_USER} / ${VBX_POSTGRES_DB}"
  echo "  PG password:      ${VBX_POSTGRES_PASSWORD}"
  echo "  Redis password:   ${VBX_REDIS_PASSWORD}"
  if [[ -s "${EXTRA_USERS_FILE}" ]]; then
    echo "  Доп. УЗ:          $(grep -c . "${EXTRA_USERS_FILE}" || echo 0) (пароли заданы вами на этапе 8)"
  fi
  echo
  echo "  Отчёт (600):      ${REPORT_FILE}"
  echo "  Лог:              ${LOG_FILE}"
  echo "  Env (600):        ${VBX_INSTALL_DIR}/config/vbx.env"
  echo "================================================================================"
  echo -e "${C_YEL}Сохраните пароль Admin сейчас — он больше нигде не печатается.${C_RST}"
  echo -e "${C_YEL}Рекомендуется сменить его после первого входа (Профиль).${C_RST}"
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
    # Пароль Admin ВСЕГДА генерируем заново (политика установщика)
    VBX_ADMIN_PASSWORD=""
    [[ -n "${VBX_HOST}" ]] || VBX_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -n "${VBX_HOST}" ]] || VBX_HOST="127.0.0.1"
    [[ -n "${VBX_ADMIN_EMAIL}" ]] || VBX_ADMIN_EMAIL="${VBX_ADMIN_USERNAME}@${VBX_HOST}"
    [[ -n "${VBX_ADMIN_FULL_NAME}" ]] || VBX_ADMIN_FULL_NAME="Главный Администратор"
    [[ -n "${VBX_ADMIN_ORG}" ]] || VBX_ADMIN_ORG="Организация"
    valid_ident "${VBX_POSTGRES_DB}" || die "VBX_POSTGRES_DB некорректен"
    valid_ident "${VBX_POSTGRES_USER}" || die "VBX_POSTGRES_USER некорректен"
    valid_ident "${VBX_ADMIN_USERNAME}" || die "VBX_ADMIN_USERNAME некорректен"
    valid_email "${VBX_ADMIN_EMAIL}" || die "VBX_ADMIN_EMAIL некорректен"
    valid_port "${VBX_HTTP_PORT}" || die "VBX_HTTP_PORT некорректен"
    valid_port "${VBX_API_PORT}" || die "VBX_API_PORT некорректен"
    if [[ "${VBX_PURGE_EXISTING}" == "yes" ]]; then
      FRESH_VOLUMES=1
    fi
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
  maybe_purge_volumes
  generate_admin_password
  write_env
  write_used_conf
  configure_firewall

  stage "Запуск Docker Compose"
  start_stack
  wait_healthy

  stage "Проверка Admin и дополнительные УЗ"
  sync_admin_password
  verify_admin_login
  create_extra_users

  stage "Финальный отчёт"
  write_report
  print_summary
}

main "$@"
