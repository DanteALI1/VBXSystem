#!/usr/bin/env bash
# VBXSystem — backup Postgres + uploads volume data
# Usage:
#   ./scripts/backup.sh                 # uses compose in CWD, writes to ./backups
#   VBX_BACKUP_DIR=/opt/vbx/backups ./scripts/backup.sh
#   COMPOSE_DIR=/opt/vbx/app ./scripts/backup.sh

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_ROOT="${VBX_BACKUP_DIR:-${COMPOSE_DIR}/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_ROOT}/${STAMP}"
ENV_FILE="${COMPOSE_DIR}/.env"

die() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "нужна команда: $1"; }

need docker
[[ -f "${ENV_FILE}" ]] || die "нет ${ENV_FILE}"
mkdir -p "${OUT_DIR}"
chmod 700 "${BACKUP_ROOT}" "${OUT_DIR}" 2>/dev/null || true

compose() {
  ( cd "${COMPOSE_DIR}" && docker compose --env-file .env "$@" )
}

echo "==> Postgres dump → ${OUT_DIR}/postgres.dump"
compose exec -T postgres pg_dump -U vbx -d vbx -Fc -f /tmp/vbx.dump
compose cp postgres:/tmp/vbx.dump "${OUT_DIR}/postgres.dump"
compose exec -T postgres rm -f /tmp/vbx.dump

echo "==> Uploads archive → ${OUT_DIR}/uploads.tar.gz"
# Prefer named volume via a helper container if api has /app/uploads
if compose ps --status running api >/dev/null 2>&1; then
  compose exec -T api tar -C /app -czf /tmp/uploads.tar.gz uploads 2>/dev/null \
    || compose run --rm --no-deps -T api tar -C /app -czf /tmp/uploads.tar.gz uploads
  compose cp api:/tmp/uploads.tar.gz "${OUT_DIR}/uploads.tar.gz" 2>/dev/null \
    || compose run --rm --no-deps -T -v "${OUT_DIR}:/backup" api \
         sh -c 'tar -C /app -czf /backup/uploads.tar.gz uploads'
  compose exec -T api rm -f /tmp/uploads.tar.gz 2>/dev/null || true
else
  echo "WARN: api не запущен — uploads пропущены" >&2
fi

{
  echo "created_at=${STAMP}"
  echo "compose_dir=${COMPOSE_DIR}"
  echo "hostname=$(hostname 2>/dev/null || echo unknown)"
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --env-file "${ENV_FILE}" ps 2>/dev/null || true
} > "${OUT_DIR}/manifest.txt"

# Keep last 14 backups by default
KEEP="${VBX_BACKUP_KEEP:-14}"
if [[ "${KEEP}" =~ ^[0-9]+$ ]] && [[ "${KEEP}" -gt 0 ]]; then
  mapfile -t OLD < <(ls -1dt "${BACKUP_ROOT}"/20* 2>/dev/null | tail -n +$((KEEP + 1)) || true)
  for d in "${OLD[@]:-}"; do
    [[ -n "${d}" ]] || continue
    rm -rf "${d}"
  done
fi

echo "OK: backup at ${OUT_DIR}"
ls -lh "${OUT_DIR}"
