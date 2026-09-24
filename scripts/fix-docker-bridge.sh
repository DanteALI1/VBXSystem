#!/usr/bin/env bash
# Fix Docker bridge hairpin on hosts where nftables + iptables-legacy conflict
# blocks container-to-container TCP (common on some cloud VMs).
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi
iptables -I DOCKER-USER 1 -j ACCEPT 2>/dev/null || true
iptables-legacy -P FORWARD ACCEPT 2>/dev/null || true
BR=$(ip -o link show type bridge | awk -F': ' '/br-/ {print $2; exit}')
if [[ -n "${BR:-}" ]]; then
  iptables -C DOCKER -i "$BR" -o "$BR" -j ACCEPT 2>/dev/null \
    || iptables -I DOCKER 1 -i "$BR" -o "$BR" -j ACCEPT
fi
echo "Docker bridge forwarding rules applied (${BR:-unknown})."
