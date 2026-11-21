#!/usr/bin/env bash
# Install a separate dashboard on Ubuntu/Debian or Fedora/RHEL with systemd.
# Run a downloaded, inspected copy as root. No miner starts automatically.
set -euo pipefail
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die 'Run with sudo on your own server.'
: "${GYDS_SOURCE_URL:?Set the HTTPS Git URL of your exported GYDS dashboard repository}"
: "${DASHBOARD_DOMAIN:?Set a domain whose DNS points to this server}"
: "${DASHBOARD_ENV_FILE:?Set the path to your completed private dashboard.env}"
case "$GYDS_SOURCE_URL" in https://*) ;; *) die 'Use an HTTPS repository URL without embedded credentials.';; esac
[[ "$GYDS_SOURCE_URL" != *'@'* && "$GYDS_SOURCE_URL" != *$'\n'* ]] || die 'Do not embed credentials in the repository URL.'
[[ "$DASHBOARD_DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$DASHBOARD_DOMAIN" == *.* ]] || die 'Use a DNS hostname, not a URL.'
[ -f "$DASHBOARD_ENV_FILE" ] || die 'Private dashboard.env does not exist.'
BASE=/opt/gyds-dashboard
[ ! -e "$BASE" ] || die 'Dashboard already exists. Back up and update it separately; this installer never overwrites an existing installation.'
if command -v apt-get >/dev/null; then
  apt-get update
  apt-get install -y curl ca-certificates git nginx certbot python3-certbot-nginx build-essential
elif command -v dnf >/dev/null; then
  dnf install -y curl ca-certificates git nginx certbot python3-certbot-nginx gcc gcc-c++ make nodejs npm
else die 'Dashboard server setup supports Ubuntu/Debian and Fedora/RHEL. Use miner-only setup on other devices.'; fi
command -v systemctl >/dev/null && [ -d /run/systemd/system ] || die 'Dashboard hosting needs systemd; containers need their own service setup.'
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  if command -v apt-get >/dev/null; then
    TEMP="$(mktemp)"; curl -fsSL https://deb.nodesource.com/setup_22.x -o "$TEMP"; bash "$TEMP"; rm -f "$TEMP"
    apt-get install -y nodejs
  else die 'Install Node.js 22+ from a compatible repository and rerun.'; fi
fi
id gyds-dashboard >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/gyds-dashboard --shell /usr/sbin/nologin gyds-dashboard
install -d -m 700 -o gyds-dashboard -g gyds-dashboard "$BASE"
# Clone/build as a dedicated unprivileged user, never execute repo scripts as root.
runuser -u gyds-dashboard -- git clone --depth 1 "$GYDS_SOURCE_URL" "$BASE/source"
[ -f "$BASE/source/public/rig-agent/check-dashboard-config.mjs" ] || die 'Repository does not contain the current dashboard setup files. Export the latest code.'
install -d -m 700 /etc/gyds-dashboard
node "$BASE/source/public/rig-agent/check-dashboard-config.mjs" "$DASHBOARD_ENV_FILE" /etc/gyds-dashboard/dashboard.env
install -m 600 -o gyds-dashboard -g gyds-dashboard /etc/gyds-dashboard/dashboard.env "$BASE/source/.env"
NODE="$(command -v node)"
NPM="$(command -v npm)"
runuser -u gyds-dashboard -- "$NPM" install --prefix /var/lib/gyds-dashboard/tools bun@1.4.4
BUN=/var/lib/gyds-dashboard/tools/node_modules/.bin/bun
runuser -u gyds-dashboard -- bash -c 'cd "$1"; "$2" install --frozen-lockfile; "$2" run build' _ "$BASE/source" "$BUN"
[ -f "$BASE/source/.output/server/index.mjs" ] || die 'No Node-server output found. Keep the node-server deployment preset for separate hosting.'
cat > /etc/systemd/system/gyds-dashboard.service <<EOF
[Unit]
Description=GYDS self-hosted dashboard
After=network-online.target
Wants=network-online.target
[Service]
User=gyds-dashboard
Group=gyds-dashboard
WorkingDirectory=$BASE/source
EnvironmentFile=/etc/gyds-dashboard/dashboard.env
Environment=NODE_ENV=production
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
ExecStart=$NODE .output/server/index.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/nginx/conf.d/gyds-dashboard.conf <<EOF
server {
  listen 80;
  server_name $DASHBOARD_DOMAIN;
  client_max_body_size 1m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 120s;
  }
}
EOF
nginx -t
systemctl daemon-reload
systemctl enable --now gyds-dashboard nginx
systemctl reload nginx
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$DASHBOARD_DOMAIN"
# Check the actual HTTPS dashboard, not just service registration.
READY=0
for attempt in {1..15}; do
  if curl -fsS "https://$DASHBOARD_DOMAIN/api/public/app-version" >/dev/null; then READY=1; break; fi
  sleep 2
done
[ "$READY" = 1 ] || die 'Dashboard did not answer over HTTPS. Inspect journalctl -u gyds-dashboard and nginx logs.'
printf 'Dashboard reachable: https://%s\n' "$DASHBOARD_DOMAIN"
printf 'Sign in there, Add rig, then run its miner-only command on this server or any other device. Each rig needs its own token.\n'
printf 'Open ports 80/443 in your firewall. Add this origin to backend sign-in settings. AI credentials and existing accounts/data are not copied.\n'