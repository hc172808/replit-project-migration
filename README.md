# Replit Project Migration

/skill:migrate-external-project Source: Replit. Migrate the attached project into Lovable.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f5e522de-d8b0-4696-9645-4b4b4dd241c8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Self-host on Ubuntu or other Linux servers

See [Linux deployment instructions](docs/self-hosting.md). From the project
checkout, run `bash deploy.sh` once as a user with sudo access. It installs
prerequisites, creates a locked-down Linux service account, builds the dashboard,
and installs a systemd service. It reuses valid Supabase settings or prompts for
credentials for an existing Supabase project; it cannot create that project.
The script does not install or start mining software.

## Local development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
