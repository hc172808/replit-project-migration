# One-command Linux server setup

On a systemd-based Ubuntu/Debian, Fedora/RHEL, Arch, or openSUSE server, clone
the project and run one command as a normal user with sudo access:

```bash
git clone <your-repository-url> gyds-dashboard
cd gyds-dashboard
bash deploy.sh
```

The script asks for administrator access itself. On a first run, it installs
system build prerequisites, installs verified Node.js 22 when needed, creates
the locked-down `gyds-dashboard` Linux service account, builds a protected app
release under `/opt/gyds-dashboard`, and enables/restarts a systemd service. The
service account has no interactive shell or password. Later, pull updates and
run `bash deploy.sh` again; a failed build leaves the currently running release
in place.

It uses `apt`, `dnf`, `yum`, `pacman`, or `zypper`. Automatic Node.js download
supports x86_64 and arm64 Linux distributions compatible with official Node
binaries. Alpine and servers without systemd are not supported by this
one-command installer.

## Supabase credentials are still required

The dashboard depends on an existing Supabase project with this app's database
schema and backend functions already configured. The installer cannot create
cloud projects, database schemas, or credentials. If the checkout has valid
Supabase settings in `.env`, the installer copies them to
`/etc/gyds-dashboard/dashboard.env`. Otherwise it prompts for the project URL,
public key, and server-only service-role key (entered without echoing it).

The server-only key is stored for the service account to read; it is not
included in the browser bundle. Never put a service-role key in a `VITE_`
setting. The app's dashboard login is separate: create or use your dashboard
account through the app after it is online; the Linux service account is not a
dashboard login.

The installed settings file is the source of truth on subsequent deployments.
Edit `/etc/gyds-dashboard/dashboard.env` to change it, then rerun the script so
public `VITE_` settings are rebuilt. Optional WalletConnect and AI-provider
settings can be added there if those features are needed.

This repository already tracks an `.env` file. The installer does not display
its values or remove it from Git. Replace imported credentials with your own;
remove `.env` from version control and rotate any credentials that were
committed.

## Network access and HTTPS

The service listens on `127.0.0.1:5000` by default. It does not create DNS,
configure HTTPS, or change firewall rules. To make the dashboard publicly
reachable, configure an HTTPS reverse proxy and point your domain to the
server; also set the matching site/redirect URLs in Supabase. Keep the
application bound to loopback behind the proxy. Do not expose port 5000
directly to the public internet.

The script does not migrate or replace a database, create dashboard accounts,
install mining software, or start mining. Rig agents are installed separately
on owner-controlled mining hardware.

## Service management

The script installs `/etc/systemd/system/gyds-dashboard.service` and stores
application releases under `/opt/gyds-dashboard`. Configuration is kept in
`/etc/gyds-dashboard/dashboard.env`; old release directories are retained so
you can recover a previous build if needed.

```bash
sudo systemctl status gyds-dashboard
sudo journalctl -u gyds-dashboard -f
sudo systemctl stop gyds-dashboard
```

Optional overrides:

```bash
bash deploy.sh --service my-dashboard --service-user my-dashboard --port 5050
```

The health check confirms the service starts and its home page responds locally.
It does not sign into Supabase or verify dashboard features.
