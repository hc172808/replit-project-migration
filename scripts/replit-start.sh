#!/usr/bin/env bash
set -euo pipefail

export NITRO_HOST="${NITRO_HOST:-0.0.0.0}"
export NITRO_PORT="${NITRO_PORT:-${PORT:-5000}}"

exec node .output/server/index.mjs
