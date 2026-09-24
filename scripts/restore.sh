#!/usr/bin/env bash
# VBXSystem — restore Postgres (+ optional uploads) from a backup directory
# Usage:
#   ./scripts/restore.sh /path/to/backups/20260924T120000Z
# WARNING: replaces current database. Stop worker/api traffic first if possible.

set -euo pipefail

BACKUP_DIR="${1:-}"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${COMPOSE_DIR}/.env"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "${BACKUP_DIR}" ]] || die "укажите каталог бэкапа"
[[ -d "${BACKUP_DIR}" ]] || die "нет каталога ${BACKUP_DIR}"
[[ -f "${BACKUP_DIR}/postgres.dump" ]] || die "нет postgres.dump в ${BACKUP_DIR}"
[[ -f "${ENV_FILE}" ]] || die "нет ${ENV_FILE}"

compose() {
  ( cd "${COMPOSE_DIR}" && docker compose --env-file .env "$@" )
}

echo "WARN: будет выполнено восстановление БД из ${BACKUP_DIR}"
echo "Продолжить через 5 секунд (Ctrl+C для отмены)…"
sleep 5

echo "==> Останавливаю api/worker (postgres остаётся)"
compose stop api worker 2>/dev/null || true

echo "==> Восстановление Postgres"
compose cp "${BACKUP_DIR}/postgres.dump" postgres:/tmp/vbx.dump
compose exec -T postgres \
  bash -c 'pg_restore -U vbx -d vbx --clean --if-exists /tmp/vbx.dump || true'
compose exec -T postgres rm -f /tmp/vbx.dump

if [[ -f "${BACKUP_DIR}/uploads.tar.gz" ]]; then
  echo "==> Восстановление uploads"
  compose start api 2>/dev/null || compose up -d api
  sleep 3
  compose cp "${BACKUP_DIR}/uploads.tar.gz" api:/tmp/uploads.tar.gz
  compose exec -T api tar -C /app -xzf /tmp/uploads.tar.gz
  compose exec -T api rm -f /tmp/uploads.tar.gz
fi

echo "==> Запуск сервисов"
compose up -d
echo "OK: restore завершён. Проверьте /health и логи."
