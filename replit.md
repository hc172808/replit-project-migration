# Replit setup

## Run the app

Use the Replit **Start application** workflow to run the Vite development
server. It listens on port 5000 and accepts Replit's proxied preview host.

For local development with Node.js 22 or newer, install the dependencies with
`npm install` and run `npm run dev`.

## Publish

The Replit Autoscale deployment is configured to run `npm run deploy:check`
before publishing and `npm run start` for the production server. The check runs
the test suite and production build. Use Replit's **Publish** action to create
or update the deployment; these settings do not publish automatically.

The start script binds the production server to `0.0.0.0` and uses Replit's
`PORT` when provided, otherwise port 5000.

## Supabase configuration

The public landing page can load without connecting a new Supabase project.
Authentication and dashboard features require the existing Supabase project
settings listed in `.env.example`. Set the `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, and
`SUPABASE_PUBLISHABLE_KEY` values in the environment. Keep
`SUPABASE_SERVICE_ROLE_KEY` server-side only; store it as a Replit Secret, never
as a `VITE_` variable or in committed files.

Wallet sign-in also uses `VITE_WALLETCONNECT_PROJECT_ID` when phone-wallet
connections are needed.

## GYDS mining RPC

New GYDS profiles use the official endpoint
`https://netlifegy.com/api/mining/rpc`. It currently presents Cloudflare Access,
so add the endpoint's service-token Client ID and Secret under the profile's
**Node endpoints** before testing or mining. The same preset is available from
the endpoint settings for existing profiles.
