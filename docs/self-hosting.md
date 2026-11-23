# Deploy the dashboard on Linux

`deploy.sh` builds the existing TanStack/Nitro Node server and installs a
systemd service. It supports Ubuntu/Debian and other systemd-based Linux
distributions. It does **not** install a mining rig, run database migrations,
provision Supabase, configure DNS/TLS, or open firewall ports.

## First installation

Use a non-root account with sudo access. Clone this repository into a directory
owned by that account, such as `~/gyds-dashboard`. Paths with spaces or shell
special characters are not supported.

```bash
cd ~/gyds-dashboard
cp .env.example .env
chmod 600 .env
nano .env
bash deploy.sh --install-deps
```

If `.env` is missing, the script creates the template and stops for you to edit
it. Supply your own Supabase URL, public key, and server-only service-role key.
Never use a service-role key for any `VITE_` setting: those settings become public
in the browser bundle. Never commit `.env`.

This import already tracks an `.env` file. Ignore rules do not remove previously
tracked files: replace imported settings with your own, remove `.env` from Git
tracking with `git rm --cached .env` when ready, and rotate any credentials that
were committed. The installer does not delete that file or rewrite Git history.

`--install-deps` installs build tools through apt, dnf, yum, pacman or zypper.
If Node.js 22+ is missing, it downloads official Node.js 22 Linux binaries,
checks their SHA-256 checksum, and installs them under
`~/.local/share/gyds-node`. Automatic Node installation supports x86_64/arm64
on distributions compatible with official glibc-based Node binaries, not Alpine.
It does not replace a system Node installation. Package installs require network
access and may take several minutes.

The script uses `npm ci` when an npm lockfile exists, otherwise the existing
Bun lockfile if Bun is installed. With neither available, it uses npm without
creating a new lockfile; package ranges can resolve differently across installs.

## Public access and configuration

By default the server listens on **127.0.0.1:5000**, accessible only on the server.
Configure your existing HTTPS reverse proxy (for example Nginx or Caddy) to
forward your domain to that address. Configure the domain and allowed auth
redirect URLs in your Supabase project as well.

```bash
# Explicitly expose the port, only if your firewall/network policy permits it:
bash deploy.sh --host 0.0.0.0 --port 5000

# Custom service name:
bash deploy.sh --service my-dashboard --port 5050
```

This installs/replaces `/etc/systemd/system/gyds-dashboard.service` (or the
chosen name), enables startup after reboot, and restarts the service only after
the build succeeds. It runs as your non-root account. Logs go to journald.
Do not delete/move the checkout or its Node installation while the service uses
them. Reserve this service name for this app.

Database schema and backend functions must already be configured in Supabase;
the script does not migrate or replace your database. WalletConnect requires
its own project ID. AI diagnosis also requires the existing AI provider settings;
it is not provisioned by the script.

## Updates and troubleshooting

```bash
git pull --ff-only
bash deploy.sh
sudo systemctl status gyds-dashboard
sudo journalctl -u gyds-dashboard -n 100 --no-pager
sudo systemctl stop gyds-dashboard
# Disable automatic startup without deleting the checkout:
sudo systemctl disable --now gyds-dashboard
```

Re-run with the same `--service`, `--port` and `--host` options on updates.
Rebuild after changing `VITE_` settings because they are compiled into the app.
Builds run in the checkout, so this is not a zero-downtime or automatic-rollback
deployment. Use a maintenance window and retain a known working release/backup.
The final check requires the service to be active and its home page to return
a successful HTTP response; this does not test signed-in features or Supabase.

For Linux without systemd, prepare prerequisites and run:

```bash
bash deploy.sh --build-only
NODE_ENV=production NITRO_HOST=127.0.0.1 NITRO_PORT=5000 \
  node --env-file=.env .output/server/index.mjs
```

Use your platform's process manager to supervise that command. If the script
installed Node locally, add `$HOME/.local/share/gyds-node/bin` to your PATH first.
