#!/usr/bin/env bash
set -euo pipefail
if [[ "${PREFIX:-}" != *com.termux* ]]; then
  printf '%s\n' 'Run this installer inside Termux on Android. For computers use install.sh.' >&2
  exit 1
fi
: "${DASHBOARD_URL:?Set DASHBOARD_URL from your rig setup screen}"
: "${RIG_TOKEN:?Set RIG_TOKEN from your rig setup screen}"
pkg install -y nodejs-lts curl bash
TEMP_SCRIPT="$(mktemp)"
trap 'rm -f "$TEMP_SCRIPT"' EXIT
curl -fsSL "${DASHBOARD_URL%/}/rig-agent/install.sh" -o "$TEMP_SCRIPT"
bash "$TEMP_SCRIPT"