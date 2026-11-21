#!/usr/bin/env bash
# Optional CPU mining software; never starts mining during installation.
set -euo pipefail
: "${INSTALL_DIR:?Set INSTALL_DIR}"
SUDO=(); if [ "$(id -u)" -ne 0 ] && [[ "${PREFIX:-}" != *com.termux* ]] && [ "$(uname)" != Darwin ]; then SUDO=(sudo); fi
CMAKE_EXTRA=()
if [[ "${PREFIX:-}" == *com.termux* ]]; then
  pkg install -y git cmake make clang libuv openssl
  CMAKE_EXTRA=(-DWITH_HWLOC=OFF)
elif command -v apt-get >/dev/null; then
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y git cmake build-essential libuv1-dev libssl-dev libhwloc-dev
elif command -v dnf >/dev/null; then
  "${SUDO[@]}" dnf install -y git cmake make gcc gcc-c++ libuv-devel openssl-devel hwloc-devel
elif command -v pacman >/dev/null; then
  "${SUDO[@]}" pacman -Syu --needed --noconfirm git cmake base-devel libuv openssl hwloc
elif command -v apk >/dev/null; then
  "${SUDO[@]}" apk add git cmake build-base libuv-dev openssl-dev hwloc-dev
elif command -v brew >/dev/null; then
  brew install git cmake libuv openssl hwloc
else echo 'XMRig build prerequisites are not supported on this system' >&2; exit 1; fi
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
git clone --depth 1 --branch v6.22.2 https://github.com/xmrig/xmrig.git "$STAGING/source"
cmake -S "$STAGING/source" -B "$STAGING/build" -DCMAKE_BUILD_TYPE=Release "${CMAKE_EXTRA[@]}"
# Limit compiler memory use on phones and small servers.
cmake --build "$STAGING/build" --parallel 2
mkdir -p "$INSTALL_DIR/bin"
install -m 755 "$STAGING/build/xmrig" "$INSTALL_DIR/bin/xmrig"
"$INSTALL_DIR/bin/xmrig" --version
echo 'XMRig installed. Select a Monero profile with a pool and wallet, then press Start in the dashboard.'