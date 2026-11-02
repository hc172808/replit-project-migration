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

# ── Node.js 18+ ──────────────────────────────────────────────────────────────
need_node() {
  command -v node >/dev/null 2>&1 || return 0
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -lt 18 ]
}
if need_node; then
  say "Installing Node.js…"
  if [ "$IS_TERMUX" = 1 ]; then pkg install -y nodejs
  elif command -v apt-get >/dev/null; then
    SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - && $SUDO apt-get install -y nodejs
  elif command -v dnf >/dev/null; then sudo dnf install -y nodejs
  elif command -v brew >/dev/null; then brew install node
  else die "Please install Node.js 18 or newer, then run this again."; fi
fi
NODE_BIN="$(command -v node)"

# ── Files ────────────────────────────────────────────────────────────────────
say "Installing into $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$DASHBOARD_URL/rig-agent/agent.mjs" -o "$INSTALL_DIR/agent.mjs"
curl -fsSL "$DASHBOARD_URL/rig-agent/env.example" -o "$INSTALL_DIR/.env.example" || true

if [ -f "$INSTALL_DIR/.env" ]; then
  # Keep the user's miner paths / options, refresh the connection details.
  sed -i.bak -e "s|^DASHBOARD_URL=.*|DASHBOARD_URL=$DASHBOARD_URL|" -e "s|^RIG_TOKEN=.*|RIG_TOKEN=$RIG_TOKEN|" -e "s|^RIG_NAME=.*|RIG_NAME=$RIG_NAME|" "$INSTALL_DIR/.env"
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

# Restart-forever wrapper used where no service manager exists.
cat > "$INSTALL_DIR/run.sh" <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR"
while true; do
  "$NODE_BIN" agent.mjs >> "$INSTALL_DIR/rig.log" 2>&1
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
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  RUN_USER="$(id -un)"; [ "${RUN_AS_ROOT:-0}" = 1 ] && RUN_USER=root
  $SUDO tee /etc/systemd/system/gyds-rig.service >/dev/null <<EOF
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
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now gyds-rig
  $SUDO systemctl restart gyds-rig
  say "Installed as a system service. Logs: journalctl -u gyds-rig -f"
else
  pkill -f "$INSTALL_DIR/run.sh" 2>/dev/null || true
  nohup "$INSTALL_DIR/run.sh" >/dev/null 2>&1 &
  ( crontab -l 2>/dev/null | grep -v gyds-rig; echo "@reboot $INSTALL_DIR/run.sh # gyds-rig" ) | crontab - 2>/dev/null || true
  say "Started in the background (restarts on reboot via cron). Logs: $INSTALL_DIR/rig.log"
fi

say "Done. Your rig should appear online on the dashboard within ~15 seconds."
