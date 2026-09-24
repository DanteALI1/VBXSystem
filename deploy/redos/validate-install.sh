#!/usr/bin/env bash
# Post-install smoke checks (run on the VBX host after install.sh or compose up)
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
HTTP_PORT="${VBX_HTTP_PORT:-80}"
API_PORT="${VBX_API_PORT:-8000}"
FAIL=0

ok() { echo "OK  $*"; }
fail() { echo "FAIL $*"; FAIL=1; }

echo "VBX validate — compose_dir=${COMPOSE_DIR}"

if command -v docker >/dev/null 2>&1; then ok "docker available"; else fail "docker available"; fi

if ( cd "${COMPOSE_DIR}" && docker compose --env-file .env ps >/dev/null 2>&1 ); then
  ok "compose ps"
else
  fail "compose ps"
fi

if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
  ok "API /health"
else
  fail "API /health"
fi

if curl -fsS "http://127.0.0.1:${API_PORT}/ready" >/dev/null; then
  ok "API /ready"
else
  fail "API /ready"
fi

code="$(curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${HTTP_PORT}/login" || true)"
if [[ "${code}" =~ ^(200|307|308)$ ]]; then
  ok "Web /login (${code})"
else
  fail "Web /login (got ${code})"
fi

hdrs="$(curl -fsS -D - -o /dev/null "http://127.0.0.1:${API_PORT}/health" || true)"
if echo "${hdrs}" | grep -qi 'x-content-type-options: *nosniff'; then
  ok "security header X-Content-Type-Options"
else
  fail "security header X-Content-Type-Options"
fi

if [[ -f /opt/vbx/VBX_INSTALL_INFO.txt ]]; then
  if [[ -s /opt/vbx/VBX_INSTALL_INFO.txt ]]; then ok "VBX_INSTALL_INFO.txt non-empty"; else fail "VBX_INSTALL_INFO.txt non-empty"; fi
  if grep -qE 'СУПЕР-АДМИНИСТРАТОР|супер-администратора|Логин:' /opt/vbx/VBX_INSTALL_INFO.txt; then
    ok "report mentions admin"
  else
    fail "report mentions admin"
  fi
  if grep -qE 'Пароль:[[:space:]]+\S+' /opt/vbx/VBX_INSTALL_INFO.txt; then
    ok "report has admin password field"
  else
    fail "report has admin password field"
  fi
  if grep -qE 'PostgreSQL \(Docker\)|DB password:' /opt/vbx/VBX_INSTALL_INFO.txt; then
    ok "report has postgres credentials section"
  else
    fail "report has postgres credentials section"
  fi
else
  echo "SKIP VBX_INSTALL_INFO.txt (нет /opt/vbx — не РЕД ОС install)"
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "VALIDATION FAILED"
  exit 1
fi
echo "VALIDATION PASSED"
