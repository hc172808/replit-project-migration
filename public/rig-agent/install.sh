#!/usr/bin/env bash
# GYDS rig program installer — Linux (Ubuntu/Debian/etc.), macOS and Android (Termux).
# Usage (copy the exact line from your dashboard's "Add rig" screen):
#   curl -fsSL https://YOUR-DASHBOARD/rig-agent/install.sh | DASHBOARD_URL=https://YOUR-DASHBOARD RIG_TOKEN=rig_... RIG_NAME="my-rig" bash
#
# Installs into ~/.gyds-rig and sets the program to start on boot and restart
# itself if it ever stops, so it keeps mining until you press Stop on the dashboard.
set -euo pipefail

: "${DASHBOARD_URL:?Set DASHBOARD_URL}"
: "${RIG_TOKEN:?Set RIG_TOKEN}"
RIG_NAME="${RIG_NAME:-$(hostname)}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.gyds-rig}"
DASHBOARD_URL="${DASHBOARD_URL%/}"
IS_TERMUX=0; [ -n "${PREFIX:-}" ] && [[ "$PREFIX" == *com.termux* ]] && IS_TERMUX=1

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# ── Validate settings and install runtime prerequisites ────────────────────────
case "$DASHBOARD_URL" in https://*) ;; *) die "Use an https:// published dashboard URL.";; esac
[[ "$RIG_TOKEN" =~ ^rig_[a-fA-F0-9]{64}$ ]] || die "Use the token from Add rig."
[[ "$RIG_NAME" != *$'\n'* && "$RIG_NAME" != *$'\r'* ]] || die "Rig name must be a single line."
[[ "$INSTALL_DIR" =~ ^/[a-zA-Z0-9_./-]+$ ]] || die "INSTALL_DIR must be an absolute path without spaces or shell characters."
SETUP_MODE="${SETUP_MODE:-miner-only}"
MINING_SOFTWARE="${MINING_SOFTWARE:-builtin}"
case "$SETUP_MODE" in miner-only) ;; *) die "For separate hosting use setup.sh or setup-dashboard-server.sh first, then Add rig on that dashboard.";; esac
case "$MINING_SOFTWARE" in builtin|xmrig) ;; *) die "Invalid MINING_SOFTWARE";; esac
SUDO=()
if [ "$IS_TERMUX" = 0 ] && [ "$(uname)" != Darwin ] && [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "Install sudo or run as administrator."
  SUDO=(sudo)
fi
# No mining or overclock changes run during setup.
if [ "$IS_TERMUX" = 1 ]; then
  pkg update -y
  pkg install -y nodejs-lts curl bash ca-certificates
elif command -v apt-get >/dev/null; then
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y curl ca-certificates pciutils cron
elif command -v dnf >/dev/null; then
  "${SUDO[@]}" dnf install -y curl ca-certificates pciutils cronie
elif command -v pacman >/dev/null; then
  "${SUDO[@]}" pacman -Syu --needed --noconfirm curl ca-certificates pciutils cronie
elif command -v apk >/dev/null; then
  "${SUDO[@]}" apk add curl ca-certificates pciutils dcron bash
elif command -v brew >/dev/null; then
  command -v curl >/dev/null || brew install curl
else die "Supported: Ubuntu/Debian, Fedora/RHEL, Arch, Alpine, macOS with Homebrew, Android with Termux."; fi
need_node() {
  command -v node >/dev/null 2>&1 || return 0
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -lt 22 ]
}
if need_node; then
  say "Installing Node.js 22+…"
  if [ "$IS_TERMUX" = 1 ]; then pkg install -y nodejs-lts
  elif command -v apt-get >/dev/null; then
    NODE_SETUP="$(mktemp)"
    curl -fsSL https://deb.nodesource.com/setup_22.x -o "$NODE_SETUP"
    "${SUDO[@]}" -E bash "$NODE_SETUP"
    rm -f "$NODE_SETUP"
    "${SUDO[@]}" apt-get install -y nodejs
  elif command -v dnf >/dev/null; then "${SUDO[@]}" dnf install -y nodejs
  elif command -v pacman >/dev/null; then "${SUDO[@]}" pacman -S --needed --noconfirm nodejs
  elif command -v apk >/dev/null; then "${SUDO[@]}" apk add nodejs
  elif command -v brew >/dev/null; then brew install node@22; export PATH="$(brew --prefix node@22)/bin:$PATH"
  fi
fi
need_node && die "Your package repository provides an old Node version. Install Node.js 22+ and rerun."
NODE_BIN="$(command -v node)"

# ── Files ────────────────────────────────────────────────────────────────────
say "Installing into $INSTALL_DIR"
umask 077
mkdir -p "$INSTALL_DIR"
TEMP_AGENT="$(mktemp "$INSTALL_DIR/agent.XXXXXX")"
trap 'rm -f "$TEMP_AGENT"' EXIT
curl -fsSL "$DASHBOARD_URL/rig-agent/agent.mjs" -o "$TEMP_AGENT"
"$NODE_BIN" --input-type=module --check < "$TEMP_AGENT"
mv "$TEMP_AGENT" "$INSTALL_DIR/agent.mjs"
curl -fsSL "$DASHBOARD_URL/rig-agent/env.example" -o "$INSTALL_DIR/.env.example" || true

if [ -f "$INSTALL_DIR/.env" ]; then
  # Keep the user's miner paths / options, refresh the connection details.
  export DASHBOARD_URL RIG_TOKEN RIG_NAME INSTALL_DIR
  "$NODE_BIN" --input-type=module - <<'JS'
import fs from 'node:fs';
const file = `${process.env.INSTALL_DIR}/.env`;
let text = fs.readFileSync(file, 'utf8');
for (const key of ['DASHBOARD_URL', 'RIG_TOKEN', 'RIG_NAME']) {
  const line = `${key}=${process.env[key]}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, () => line) : `${text}\n${line}\n`;
}
fs.writeFileSync(file, text, { mode: 0o600 });
JS
else
  cat > "$INSTALL_DIR/.env" <<EOF
# GYDS rig program settings — keep this file private
DASHBOARD_URL=$DASHBOARD_URL
RIG_TOKEN=$RIG_TOKEN
RIG_NAME=$RIG_NAME

# Paths to mining programs you've installed (only the ones you use)
XMRIG_PATH=xmrig
TREX_PATH=t-rex
LOLMINER_PATH=lolMiner
SRBMINER_PATH=SRBMiner-MULTI
CGMINER_PATH=cgminer

# Let the dashboard change GPU clocks, power and fans on this machine
ALLOW_GPU_OC=false
# Install new rig program versions automatically (otherwise press Update on the dashboard)
AUTO_UPDATE=false
EOF
fi
chmod 600 "$INSTALL_DIR/.env"

if [ "$MINING_SOFTWARE" = xmrig ]; then
  TEMP_MINER="$(mktemp)"
  curl -fsSL "$DASHBOARD_URL/rig-agent/install-miner.sh" -o "$TEMP_MINER"
  INSTALL_DIR="$INSTALL_DIR" bash "$TEMP_MINER"
  rm -f "$TEMP_MINER"
  # Paths are restricted above, so replacement is safe.
  if grep -q '^XMRIG_PATH=' "$INSTALL_DIR/.env"; then
    sed -i.bak "s|^XMRIG_PATH=.*|XMRIG_PATH=$INSTALL_DIR/bin/xmrig|" "$INSTALL_DIR/.env"
    rm -f "$INSTALL_DIR/.env.bak"
  else printf '\nXMRIG_PATH=%s/bin/xmrig\n' "$INSTALL_DIR" >> "$INSTALL_DIR/.env"; fi
fi

# Restart-forever wrapper used where no service manager exists.
cat > "$INSTALL_DIR/run.sh" <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR"
while true; do
  "$NODE_BIN" "$INSTALL_DIR/agent.mjs" >> "$INSTALL_DIR/rig.log" 2>&1
  sleep 3
done
EOF
chmod +x "$INSTALL_DIR/run.sh"

# ── Keep it running ──────────────────────────────────────────────────────────
if [ "$IS_TERMUX" = 1 ]; then
  say "Termux: starting in the background (install the Termux:Boot app to start on phone boot)"
  mkdir -p "$HOME/.termux/boot"
  printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\nnohup %s/run.sh >/dev/null 2>&1 &\n' "$INSTALL_DIR" > "$HOME/.termux/boot/gyds-rig"
  chmod +x "$HOME/.termux/boot/gyds-rig"
  command -v termux-wake-lock >/dev/null && termux-wake-lock || true
  pkill -f "$INSTALL_DIR/run.sh" 2>/dev/null || true
  pkill -f "$NODE_BIN $INSTALL_DIR/agent.mjs" 2>/dev/null || true
  nohup "$INSTALL_DIR/run.sh" >/dev/null 2>&1 &
elif [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.gyds.rig.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.gyds.rig</string>
  <key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$INSTALL_DIR/agent.mjs</string></array>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$INSTALL_DIR/rig.log</string>
  <key>StandardErrorPath</key><string>$INSTALL_DIR/rig.log</string>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  say "Installed as a login service (com.gyds.rig)."
elif command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  RUN_USER="$(id -un)"; [ "${RUN_AS_ROOT:-0}" = 1 ] && RUN_USER=root
  "${SUDO[@]}" tee /etc/systemd/system/gyds-rig.service >/dev/null <<EOF
[Unit]
Description=GYDS rig program
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/agent.mjs
Restart=always
RestartSec=5
Nice=10

[Install]
WantedBy=multi-user.target
EOF
  "${SUDO[@]}" systemctl daemon-reload
  "${SUDO[@]}" systemctl enable --now gyds-rig
  "${SUDO[@]}" systemctl restart gyds-rig
  say "Installed as a system service. Logs: journalctl -u gyds-rig -f"
else
  pkill -f "$INSTALL_DIR/run.sh" 2>/dev/null || true
  pkill -f "$NODE_BIN $INSTALL_DIR/agent.mjs" 2>/dev/null || true
  nohup "$INSTALL_DIR/run.sh" >/dev/null 2>&1 &
  if command -v crontab >/dev/null; then
    { crontab -l 2>/dev/null | grep -v ' # gyds-rig$' || true; printf '@reboot %s/run.sh # gyds-rig\n' "$INSTALL_DIR"; } | crontab - || die "Could not register reboot startup."
    if command -v rc-service >/dev/null; then "${SUDO[@]}" rc-update add dcron default; "${SUDO[@]}" rc-service dcron start; fi
  else die "No service manager or crontab. Background process started, but boot startup is not configured."; fi
  say "Started in the background (restarts on reboot via cron). Logs: $INSTALL_DIR/rig.log"
fi

say "Service registered. Check the dashboard for an online check-in; select a profile and press Start to mine."
say "GYDS is built in; XMRig is optional. Other coins require compatible miners, drivers or ASIC hardware. No GPU drivers or overclock settings were changed."
