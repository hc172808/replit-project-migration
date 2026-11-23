#!/usr/bin/env bash
# Self-host the dashboard; this does not install or start a mining rig.
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SERVICE=gyds-dashboard
PORT=5000
HOST=127.0.0.1
INSTALL_DEPS=0
BUILD_ONLY=0
TEMP_DIR=

usage() {
  cat <<'EOF'
Usage: bash deploy.sh [options]

Run as the non-root Linux account that owns this checkout.
  --install-deps       Install build tools and, if needed, verified Node.js 22
                      (apt, dnf, yum, pacman or zypper; requires sudo)
  --build-only         Build without installing/restarting a systemd service
  --service NAME       Service name (default: gyds-dashboard)
  --port PORT          Unprivileged listening port (default: 5000)
  --host ADDRESS       Bind address (default: 127.0.0.1; use a reverse proxy)
  -h, --help           Show this help

First copy .env.example to .env and supply your own Supabase settings.
Re-run after pulling updates. A successful deployment restarts the service.
No database migrations, firewall, TLS, DNS or mining setup are performed.
EOF
}

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
need_value() { [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 requires a value"; }
cleanup() { [[ -z "$TEMP_DIR" ]] || rm -rf -- "$TEMP_DIR"; }
trap cleanup EXIT
trap 'printf "Deployment failed at line %s. No success was recorded.\n" "$LINENO" >&2' ERR

while (($#)); do
  case "$1" in
    --install-deps) INSTALL_DEPS=1; shift ;;
    --build-only) BUILD_ONLY=1; shift ;;
    --service) need_value "$@"; SERVICE="$2"; shift 2 ;;
    --port) need_value "$@"; PORT="$2"; shift 2 ;;
    --host) need_value "$@"; HOST="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[[ "$(uname -s)" == Linux ]] || die "Linux is required."
[[ "$EUID" -ne 0 ]] || die "Run as a non-root checkout owner, not sudo bash deploy.sh."
[[ "$SERVICE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || die "Invalid service name."
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || die "Port must be between 1024 and 65535."
PORT=$((10#$PORT))
((PORT >= 1024 && PORT <= 65535)) || die "Port must be between 1024 and 65535."
[[ "$HOST" =~ ^[a-zA-Z0-9.:_-]+$ ]] || die "Invalid bind address."
# Keep systemd paths literal; reject its expansion and quoting characters.
[[ "$ROOT" =~ ^/[a-zA-Z0-9/._-]+$ ]] || die "Checkout path must contain only letters, numbers, /, ., _ and -."
cd "$ROOT"
[[ -f package.json && -f .env.example ]] || die "Run from a complete project checkout."
[[ -O "$ROOT" ]] || die "The current account must own the checkout."
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  die "Created .env from the template. Edit it with your Supabase settings, then run again."
fi
[[ -O .env ]] || die "The current account must own .env."
chmod 600 .env

if (( ! BUILD_ONLY )); then
  [[ -d /run/systemd/system ]] || die "systemd is required for service installation; use --build-only otherwise."
  command -v sudo >/dev/null || die "sudo is required for service installation."
  sudo -v
fi

if (( INSTALL_DEPS )); then
  command -v sudo >/dev/null || die "Install sudo first, or install prerequisites manually."
  if command -v apt-get >/dev/null; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl xz-utils tar build-essential python3
  elif command -v dnf >/dev/null; then
    sudo dnf install -y ca-certificates curl xz tar gcc gcc-c++ make python3
  elif command -v yum >/dev/null; then
    sudo yum install -y ca-certificates curl xz tar gcc gcc-c++ make python3
  elif command -v pacman >/dev/null; then
    sudo pacman -S --needed --noconfirm ca-certificates curl xz tar base-devel python
  elif command -v zypper >/dev/null; then
    sudo zypper --non-interactive install ca-certificates curl xz tar gcc gcc-c++ make python3
  else
    die "Unsupported package manager. Install Node.js 22+, npm, curl and build tools manually."
  fi
fi

export PATH="$HOME/.local/share/gyds-node/bin:$PATH"
node_ok() {
  command -v node >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'
}
if ! node_ok; then
  (( INSTALL_DEPS )) || die "Node.js 22+ is required. Install it or use --install-deps."
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "Automatic Node installation supports x86_64 and arm64. Install Node.js 22+ manually." ;;
  esac
  command -v sha256sum >/dev/null || die "sha256sum is required."
  TEMP_DIR="$(mktemp -d)"
  # Download official binaries over HTTPS and verify before extraction.
  BASE=https://nodejs.org/dist/latest-v22.x
  curl --fail --show-error --silent --location "$BASE/SHASUMS256.txt" -o "$TEMP_DIR/SHASUMS256.txt"
  ARCHIVE="$(awk -v suffix="-linux-$ARCH.tar.xz" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+" suffix "$") {print $2}' "$TEMP_DIR/SHASUMS256.txt")"
  [[ "$ARCHIVE" =~ ^node-v22\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || die "Could not resolve the official Node archive."
  curl --fail --show-error --silent --location "$BASE/$ARCHIVE" -o "$TEMP_DIR/$ARCHIVE"
  (cd "$TEMP_DIR"; grep "  $ARCHIVE\$" SHASUMS256.txt | sha256sum --check --status)
  mkdir -p "$HOME/.local/share/gyds-node"
  tar -xJf "$TEMP_DIR/$ARCHIVE" --strip-components=1 -C "$HOME/.local/share/gyds-node"
fi
node_ok || die "Node.js 22+ failed to start; this server may be incompatible with the official Linux binaries."
command -v npm >/dev/null || die "npm is required."
command -v curl >/dev/null || die "curl is required (or use --install-deps)."
NODE="$(command -v node)"
[[ "$NODE" =~ ^/[a-zA-Z0-9/._-]+$ ]] || die "Node executable must have a simple absolute path."

# Parse dotenv with Node, never source/execute user-supplied configuration.
# Also pass VITE_ values to the build and all values to the production server.
"$NODE" --env-file=.env --input-type=module -e '
const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(key => !process.env[key] ||
  /your-project|sb_publishable_xxx/.test(process.env[key]));
if (missing.length) {
  console.error("Set real values in .env for: " + missing.join(", "));
  process.exit(1);
}
'

if [[ -f package-lock.json ]]; then
  npm ci --include=dev
elif [[ -f bun.lock ]] && command -v bun >/dev/null; then
  bun install --frozen-lockfile
else
  printf 'No npm lockfile/Bun runtime found; installing package.json ranges without creating a new lockfile.\n'
  npm install --include=dev --package-lock=false
fi
"$NODE" --env-file=.env ./node_modules/vite/bin/vite.js build
[[ -f .output/server/index.mjs ]] || die "Build did not produce the expected Node server."
if (( BUILD_ONLY )); then
  printf 'Build succeeded. Start with: node --env-file=.env .output/server/index.mjs\n'
  exit 0
fi

TEMP_DIR="${TEMP_DIR:-$(mktemp -d)}"
cat > "$TEMP_DIR/$SERVICE.service" <<EOF
[Unit]
Description=GYDS dashboard
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$(id -un)
Group=$(id -gn)
WorkingDirectory=$ROOT
Environment=NODE_ENV=production
Environment=NITRO_HOST=$HOST
Environment=NITRO_PORT=$PORT
Environment=PORT=$PORT
ExecStart=$NODE --env-file=$ROOT/.env $ROOT/.output/server/index.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
printf 'Installing/replacing %s.service and restarting it on port %s.\n' "$SERVICE" "$PORT"
sudo install -m 644 "$TEMP_DIR/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE.service"
sudo systemctl restart "$SERVICE.service"

CHECK_HOST="$HOST"
case "$HOST" in 0.0.0.0) CHECK_HOST=127.0.0.1 ;; ::) CHECK_HOST='[::1]' ;; *:*) CHECK_HOST="[$HOST]" ;; esac
for ((attempt=0; attempt<30; attempt++)); do
  if sudo systemctl is-active --quiet "$SERVICE.service" &&
    curl --fail --silent --max-time 2 --output /dev/null "http://$CHECK_HOST:$PORT/"; then
    printf 'Deployment healthy at http://%s:%s/\n' "$CHECK_HOST" "$PORT"
    printf 'Logs: sudo journalctl -u %s -f\n' "$SERVICE"
    printf 'Use an HTTPS reverse proxy before exposing the dashboard publicly.\n'
    exit 0
  fi
  sleep 2
done
die "Health check failed. Inspect: sudo journalctl -u $SERVICE -n 100 --no-pager"
