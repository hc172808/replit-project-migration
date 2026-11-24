#!/usr/bin/env bash
# Bootstrap the dashboard server. This never installs or starts mining software.
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_PATH="$ROOT/deploy.sh"
SERVICE=gyds-dashboard
SERVICE_USER=gyds-dashboard
PORT=5000
HOST=127.0.0.1
INSTALL_ROOT=/opt/gyds-dashboard
CONFIG_DIR=/etc/gyds-dashboard
CONFIG_FILE="$CONFIG_DIR/dashboard.env"
STATE_DIR=/var/lib/gyds-dashboard
TEMP_DIR=
RELEASE_DIR=
ORIGINAL_ARGS=("$@")

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Run once from the project checkout. The script requests administrator access,
installs prerequisites, creates a non-login service account, builds the app,
and installs/restarts its systemd service.

  --service NAME       systemd service name (default: gyds-dashboard)
  --service-user NAME  locked-down Linux account (default: gyds-dashboard)
  --port PORT          local listening port (default: 5000)
  --host ADDRESS       bind address (default: 127.0.0.1; keep behind HTTPS proxy)
  --install-deps       accepted for compatibility; dependencies are automatic
  -h, --help           show this help

An existing valid .env is copied to /etc/gyds-dashboard/dashboard.env.
Otherwise, the script securely prompts for credentials for an existing Supabase
project. It cannot create that project, its schema, DNS, TLS certificates, or
firewall rules. It does not install a mining rig.
EOF
}

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
need_value() { [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 requires a value"; }
cleanup() {
  [[ -z "$TEMP_DIR" ]] || rm -rf -- "$TEMP_DIR"
  if [[ -n "$RELEASE_DIR" && -d "$RELEASE_DIR" ]]; then
    rm -rf -- "$RELEASE_DIR"
  fi
}
trap cleanup EXIT
trap 'printf "Deployment failed at line %s. The previous release was left in place if its build had not completed.\n" "$LINENO" >&2' ERR

while (($#)); do
  case "$1" in
    --service) need_value "$@"; SERVICE="$2"; shift 2 ;;
    --service-user) need_value "$@"; SERVICE_USER="$2"; shift 2 ;;
    --port) need_value "$@"; PORT="$2"; shift 2 ;;
    --host) need_value "$@"; HOST="$2"; shift 2 ;;
    --install-deps) shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[[ "$(uname -s)" == Linux ]] || die "Linux is required."
[[ "$SERVICE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || die "Invalid service name."
[[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]{0,30}[$]?$ ]] || die "Invalid service account name."
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || die "Port must be between 1024 and 65535."
PORT=$((10#$PORT))
((PORT >= 1024 && PORT <= 65535)) || die "Port must be between 1024 and 65535."
[[ "$HOST" =~ ^[a-zA-Z0-9.:_-]+$ ]] || die "Invalid bind address."
[[ -f "$ROOT/package.json" && -f "$ROOT/.env.example" ]] || die "Run this script from a complete project checkout."

if (( EUID != 0 )); then
  command -v sudo >/dev/null || die "Administrator access is required. Install sudo or run sudo bash deploy.sh."
  printf 'Requesting administrator access to install the dashboard service.\n'
  exec sudo -- bash "$SCRIPT_PATH" "${ORIGINAL_ARGS[@]}"
fi

[[ -d /run/systemd/system ]] || die "A running systemd server is required."
command -v systemctl >/dev/null || die "systemctl is unavailable."

install_os_dependencies() {
  if command -v apt-get >/dev/null; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      ca-certificates curl xz-utils tar build-essential python3 npm passwd util-linux gawk
  elif command -v dnf >/dev/null; then
    dnf install -y ca-certificates curl xz tar gcc gcc-c++ make python3 npm shadow-utils util-linux gawk
  elif command -v yum >/dev/null; then
    yum install -y ca-certificates curl xz tar gcc gcc-c++ make python3 npm shadow-utils util-linux gawk
  elif command -v pacman >/dev/null; then
    pacman -S --needed --noconfirm ca-certificates curl xz tar base-devel python npm shadow util-linux gawk
  elif command -v zypper >/dev/null; then
    zypper --non-interactive install ca-certificates curl xz tar gcc gcc-c++ make python3 npm shadow util-linux gawk
  else
    die "Unsupported package manager. Supported: apt, dnf, yum, pacman, and zypper."
  fi
}

install_os_dependencies
install -d -o root -g root -m 755 "$INSTALL_ROOT" "$INSTALL_ROOT/releases"

node_version_ok() {
  "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1
}

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]] || ! node_version_ok "$NODE"; then
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "Automatic Node.js installation supports x86_64 and arm64; install Node.js 22+ manually on this architecture." ;;
  esac
  command -v sha256sum >/dev/null || die "sha256sum is required to verify the Node.js download."
  TEMP_DIR="$(mktemp -d)"
  NODE_BASE=https://nodejs.org/dist/latest-v22.x
  curl --fail --show-error --silent --location "$NODE_BASE/SHASUMS256.txt" -o "$TEMP_DIR/SHASUMS256.txt"
  NODE_ARCHIVE="$(awk -v suffix="-linux-$ARCH.tar.xz" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+" suffix "$") {print $2}' "$TEMP_DIR/SHASUMS256.txt")"
  [[ "$NODE_ARCHIVE" =~ ^node-v22\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || die "Could not resolve the official Node.js 22 archive."
  curl --fail --show-error --silent --location "$NODE_BASE/$NODE_ARCHIVE" -o "$TEMP_DIR/$NODE_ARCHIVE"
  (cd "$TEMP_DIR"; grep "  $NODE_ARCHIVE\$" SHASUMS256.txt | sha256sum --check --status)
  mkdir -p "$TEMP_DIR/node"
  tar -xJf "$TEMP_DIR/$NODE_ARCHIVE" --strip-components=1 -C "$TEMP_DIR/node"
  rm -rf "$INSTALL_ROOT/node22"
  mv "$TEMP_DIR/node" "$INSTALL_ROOT/node22"
  NODE="$INSTALL_ROOT/node22/bin/node"
fi
node_version_ok "$NODE" || die "Node.js 22+ is required."
NODE="$(readlink -f "$NODE")"
[[ "$NODE" =~ ^/[a-zA-Z0-9/._+-]+$ ]] || die "Node.js path must not contain spaces or systemd-special characters."
NODE_BIN="$(dirname "$NODE")"
export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
command -v npm >/dev/null || die "npm was not installed with the system prerequisites."

if ! getent passwd "$SERVICE_USER" >/dev/null; then
  NOLOGIN="$(command -v nologin || true)"
  [[ -n "$NOLOGIN" ]] || NOLOGIN=/usr/sbin/nologin
  useradd --system --user-group --home-dir "$STATE_DIR" --create-home --shell "$NOLOGIN" "$SERVICE_USER"
else
  SERVICE_SHELL="$(getent passwd "$SERVICE_USER" | awk -F: '{print $7}')"
  [[ "$SERVICE_SHELL" == */nologin || "$SERVICE_SHELL" == */false ]] ||
    die "Account '$SERVICE_USER' already exists with an interactive shell; choose another --service-user."
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 750 "$STATE_DIR"
install -d -o root -g "$SERVICE_GROUP" -m 750 "$CONFIG_DIR"

validate_env() {
  env -i PATH="$PATH" "$NODE" --env-file="$1" --input-type=module -e '
const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];
const missing = required.filter((key) => {
  const value = process.env[key]?.trim();
  return !value || /your-project|sb_publishable_xxx/i.test(value);
});
if (missing.length) process.exit(1);
try {
  new URL(process.env.SUPABASE_URL);
  new URL(process.env.VITE_SUPABASE_URL);
} catch {
  process.exit(1);
}
' >/dev/null 2>&1
}

write_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

prompt_for_supabase() {
  [[ -t 0 ]] || die "A valid Supabase project is required. Create $CONFIG_FILE with the settings in .env.example, then rerun."
  printf '\nThis dashboard needs an existing Supabase project; this script cannot create cloud credentials or its database.\n'
  while true; do
    local supabase_url publishable_key service_role_key candidate
    read -r -p "Supabase project URL: " supabase_url
    read -r -p "Supabase publishable/anon key: " publishable_key
    read -r -s -p "Supabase service-role/secret key (hidden): " service_role_key
    printf '\n'
    [[ -n "$supabase_url" && -n "$publishable_key" && -n "$service_role_key" ]] ||
      { printf 'All three Supabase values are required.\n'; continue; }

    candidate="$(mktemp "$CONFIG_DIR/.dashboard.env.XXXXXX")"
    {
      printf 'VITE_SUPABASE_URL=%s\n' "$(write_env_value "$supabase_url")"
      printf 'SUPABASE_URL=%s\n' "$(write_env_value "$supabase_url")"
      printf 'VITE_SUPABASE_PUBLISHABLE_KEY=%s\n' "$(write_env_value "$publishable_key")"
      printf 'SUPABASE_PUBLISHABLE_KEY=%s\n' "$(write_env_value "$publishable_key")"
      printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$(write_env_value "$service_role_key")"
    } > "$candidate"
    chmod 640 "$candidate"
    chown "root:$SERVICE_GROUP" "$candidate"
    unset service_role_key

    if validate_env "$candidate"; then
      mv -f "$candidate" "$CONFIG_FILE"
      chmod 640 "$CONFIG_FILE"
      chown "root:$SERVICE_GROUP" "$CONFIG_FILE"
      break
    fi
    rm -f "$candidate"
    printf 'Those values were not accepted. Check them and try again.\n'
  done
  unset supabase_url publishable_key
}

if [[ -f "$CONFIG_FILE" ]]; then
  validate_env "$CONFIG_FILE" || die "$CONFIG_FILE is incomplete or invalid; it was left unchanged."
  chmod 640 "$CONFIG_FILE"
  chown "root:$SERVICE_GROUP" "$CONFIG_FILE"
elif [[ -f "$ROOT/.env" ]] && validate_env "$ROOT/.env"; then
  install -o root -g "$SERVICE_GROUP" -m 640 "$ROOT/.env" "$CONFIG_FILE"
  if command -v git >/dev/null && git -C "$ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then
    printf 'Warning: this checkout tracks .env in Git. Rotate any credentials that were committed.\n' >&2
  fi
else
  prompt_for_supabase
fi

RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$$"
RELEASE_DIR="$INSTALL_ROOT/releases/$RELEASE_ID"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 750 "$RELEASE_DIR"
tar \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./node_modules' \
  --exclude='./.output' \
  --exclude='./.cache' \
  --exclude='./.local' \
  --exclude='./.agents' \
  --exclude='./dist' \
  -cf - -C "$ROOT" . | tar -xf - -C "$RELEASE_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$RELEASE_DIR"

run_as_service() {
  local directory="$1"
  shift
  runuser -u "$SERVICE_USER" -- env HOME="$STATE_DIR" PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" \
    bash -c 'cd "$1" && shift && exec "$@"' bash "$directory" "$@"
}

if [[ -f "$RELEASE_DIR/package-lock.json" ]]; then
  run_as_service "$RELEASE_DIR" npm ci --include=dev
else
  printf 'Installing project dependencies with npm. The repository has no npm lockfile.\n'
  run_as_service "$RELEASE_DIR" npm install --include=dev --package-lock=false
fi
run_as_service "$RELEASE_DIR" npm test
run_as_service "$RELEASE_DIR" "$NODE" --env-file="$CONFIG_FILE" ./node_modules/vite/bin/vite.js build
[[ -f "$RELEASE_DIR/.output/server/index.mjs" ]] || die "Build did not produce the expected Node server."
chown -R "root:$SERVICE_GROUP" "$RELEASE_DIR"
chmod -R g+rX "$RELEASE_DIR"

TEMP_DIR="$(mktemp -d)"
cat > "$TEMP_DIR/$SERVICE.service" <<EOF
[Unit]
Description=GYDS dashboard
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$INSTALL_ROOT/current
StateDirectory=gyds-dashboard
StateDirectoryMode=0750
Environment=NODE_ENV=production
Environment=NITRO_HOST=$HOST
Environment=NITRO_PORT=$PORT
Environment=PORT=$PORT
ExecStart=$NODE --env-file=$CONFIG_FILE $INSTALL_ROOT/current/.output/server/index.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
install -m 644 "$TEMP_DIR/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE.service"

PREVIOUS_RELEASE="$(readlink -f "$INSTALL_ROOT/current" 2>/dev/null || true)"
NEXT_LINK="$INSTALL_ROOT/.current-$RELEASE_ID"
ln -s "$RELEASE_DIR" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$INSTALL_ROOT/current"
RELEASE_DIR=

rollback_release() {
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -s "$PREVIOUS_RELEASE" "$NEXT_LINK"
    mv -Tf "$NEXT_LINK" "$INSTALL_ROOT/current"
    systemctl restart "$SERVICE.service" || true
  else
    systemctl stop "$SERVICE.service" || true
  fi
}

if ! systemctl restart "$SERVICE.service"; then
  rollback_release
  die "The service failed to restart. Check: journalctl -u $SERVICE -n 100 --no-pager"
fi

CHECK_HOST="$HOST"
case "$HOST" in
  0.0.0.0) CHECK_HOST=127.0.0.1 ;;
  ::) CHECK_HOST='[::1]' ;;
  *:*) CHECK_HOST="[$HOST]" ;;
esac
for ((attempt=0; attempt<30; attempt++)); do
  if systemctl is-active --quiet "$SERVICE.service" &&
    curl --fail --silent --max-time 2 --output /dev/null "http://$CHECK_HOST:$PORT/"; then
    printf '\nDashboard service is running as the locked-down Linux account %s.\n' "$SERVICE_USER"
    printf 'Local health check passed: http://%s:%s/\n' "$CHECK_HOST" "$PORT"
    printf 'Supabase configuration: %s\n' "$CONFIG_FILE"
    printf 'Logs: journalctl -u %s -f\n' "$SERVICE"
    printf 'The dashboard is loopback-only by default; HTTPS, DNS, and firewall rules are not changed.\n'
    exit 0
  fi
  sleep 2
done
rollback_release
die "Health check failed. Inspect: journalctl -u $SERVICE -n 100 --no-pager"
