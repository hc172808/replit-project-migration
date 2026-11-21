#!/usr/bin/env bash
# Download, inspect, then run on an owner-controlled device.
set -euo pipefail
: "${DASHBOARD_URL:?Set the published dashboard URL}"
case "${SETUP_MODE:-miner-only}" in miner-only|dashboard-miner) ;; *) echo 'SETUP_MODE must be miner-only or dashboard-miner' >&2; exit 1;; esac
case "${MINING_SOFTWARE:-builtin}" in builtin|xmrig) ;; *) echo 'MINING_SOFTWARE must be builtin or xmrig; install GPU/ASIC miners separately' >&2; exit 1;; esac
case "$DASHBOARD_URL" in https://*) ;; *) echo 'Use an https:// published dashboard URL' >&2; exit 1;; esac
export SETUP_MODE="${SETUP_MODE:-miner-only}" MINING_SOFTWARE="${MINING_SOFTWARE:-builtin}"
if ! command -v curl >/dev/null; then
  if [[ "${PREFIX:-}" == *com.termux* ]]; then pkg install -y curl bash
  else
    SUDO=(); if [ "$(id -u)" -ne 0 ]; then command -v sudo >/dev/null || { echo 'Install curl as administrator first' >&2; exit 1; }; SUDO=(sudo); fi
    if command -v apt-get >/dev/null; then "${SUDO[@]}" apt-get update; "${SUDO[@]}" apt-get install -y curl ca-certificates
    elif command -v dnf >/dev/null; then "${SUDO[@]}" dnf install -y curl ca-certificates
    elif command -v pacman >/dev/null; then "${SUDO[@]}" pacman -Syu --needed --noconfirm curl ca-certificates
    elif command -v apk >/dev/null; then "${SUDO[@]}" apk add curl ca-certificates
    elif command -v brew >/dev/null; then brew install curl
    else echo 'Install curl and a supported package manager first' >&2; exit 1; fi
  fi
fi
TEMP_SCRIPT="$(mktemp)"
trap 'rm -f "$TEMP_SCRIPT"' EXIT
if [ "$SETUP_MODE" = dashboard-miner ]; then
  curl -fsSL "${DASHBOARD_URL%/}/rig-agent/setup-dashboard-server.sh" -o "$TEMP_SCRIPT"
else
  curl -fsSL "${DASHBOARD_URL%/}/rig-agent/install.sh" -o "$TEMP_SCRIPT"
fi
bash "$TEMP_SCRIPT"