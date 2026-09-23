#!/usr/bin/env bash
# Остановка и (опционально) удаление VBXSystem, установленного install.sh
set -euo pipefail

INSTALL_DIR="${1:-/opt/vbx}"
APP_DIR="${INSTALL_DIR}/app"
PURGE="${VBX_PURGE:-no}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Нужен root: sudo bash $0 ${INSTALL_DIR}"
  exit 1
fi

if [[ -f "${APP_DIR}/docker-compose.yml" ]]; then
  if [[ "${PURGE}" == "yes" ]]; then
    ( cd "${APP_DIR}" && docker compose --env-file .env down -v ) || true
  else
    ( cd "${APP_DIR}" && docker compose --env-file .env down ) || true
  fi
fi

if [[ "${PURGE}" == "yes" ]]; then
  echo "Удаляю ${INSTALL_DIR} (VBX_PURGE=yes)…"
  rm -rf "${INSTALL_DIR}"
else
  echo "Стек остановлен. Данные сохранены в ${INSTALL_DIR}."
  echo "Полное удаление: sudo VBX_PURGE=yes bash $0 ${INSTALL_DIR}"
fi
