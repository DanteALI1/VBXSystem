#!/usr/bin/env bash
# Start optional local ZAP daemon, then the VBX worker.
# Spider / full / api (daemon path) need VBX_ZAP_API_URL reachable.
set -euo pipefail

ZAP_PORT="${VBX_ZAP_DAEMON_PORT:-8080}"
START_DAEMON="${VBX_ZAP_START_DAEMON:-true}"
API_URL="${VBX_ZAP_API_URL:-}"

start_daemon() {
  if [[ -z "${API_URL}" ]]; then
    export VBX_ZAP_API_URL="http://127.0.0.1:${ZAP_PORT}"
    API_URL="${VBX_ZAP_API_URL}"
  fi
  echo "[vbx-zap] starting ZAP daemon on :${ZAP_PORT} (API ${API_URL})"
  # api.disablekey=true for local docker network; set VBX_ZAP_API_KEY if you enable a key.
  zap.sh -daemon \
    -host 0.0.0.0 \
    -port "${ZAP_PORT}" \
    -config api.disablekey=true \
    -config api.addrs.addr.name=.* \
    -config api.addrs.addr.regex=true \
    >/tmp/zap-daemon.log 2>&1 &
  # Wait until JSON API answers
  for i in $(seq 1 60); do
    if python3 -c "import urllib.request; urllib.request.urlopen('${API_URL}/JSON/core/view/version/', timeout=2)" 2>/dev/null; then
      echo "[vbx-zap] daemon ready"
      return 0
    fi
    sleep 2
  done
  echo "[vbx-zap] WARNING: daemon did not become ready; spider/full via API will fail clearly" >&2
  return 0
}

if [[ "${START_DAEMON}" =~ ^(1|true|yes|on)$ ]]; then
  # Only auto-start when API URL is unset or points at localhost
  if [[ -z "${API_URL}" || "${API_URL}" =~ localhost|127\.0\.0\.1 ]]; then
    start_daemon || true
  else
    echo "[vbx-zap] VBX_ZAP_API_URL=${API_URL} (external); not starting local daemon"
  fi
else
  echo "[vbx-zap] VBX_ZAP_START_DAEMON=false; baseline scripts still work; spider needs external daemon"
fi

exec python3 -u /opt/vbx/zap/worker.py
