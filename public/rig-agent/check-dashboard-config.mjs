// Node-only installer preflight. Never print configuration values.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseDashboardConfig(text) {
  const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_WALLETCONNECT_PROJECT_ID']);
  const config = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^([A-Z_0-9]+)=(.*)$/.exec(line);
    if (!match || !allowed.has(match[1])) throw new Error('Only supported dashboard settings are allowed.');
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value && !/^[A-Za-z0-9_./:=+\-]+$/.test(value)) throw new Error('Configuration contains unsupported characters.');
    if (Object.hasOwn(config, match[1])) throw new Error('Duplicate configuration setting.');
    config[match[1]] = value;
  }
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!config[key]) throw new Error(`Fill in ${key} using your own backend; managed Cloud secrets cannot be exported.`);
  }
  for (const key of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    const url = new URL(config[key]);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Backend URLs must be HTTPS origins.');
    if (url.hostname.endsWith('.lovable.cloud') || url.hostname.includes('id-preview--')) throw new Error('Separate hosting needs your own backend, not the managed preview connection.');
  }
  if (config['SUPABASE_URL'].replace(/\/$/, '') !== config['VITE_SUPABASE_URL'].replace(/\/$/, '') || config['SUPABASE_PUBLISHABLE_KEY'] !== config['VITE_SUPABASE_PUBLISHABLE_KEY']) throw new Error('Browser and server settings must point to the same backend.');
  if (config['SUPABASE_SERVICE_ROLE_KEY'] === config['SUPABASE_PUBLISHABLE_KEY']) throw new Error('Private admin and public keys must be different.');
  return config;
}

export async function checkBackend(config, request = fetch) {
  const key = config['SUPABASE_SERVICE_ROLE_KEY'];
  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers['Authorization'] = `Bearer ${key}`;
  for (const table of ['profiles', 'auth_nonces', 'miner_settings', 'miner_stats', 'mining_profiles', 'rigs', 'rig_commands', 'rig_update_history', 'rpc_endpoints']) {
    const response = await request(`${config['SUPABASE_URL'].replace(/\/$/, '')}/rest/v1/${table}?select=*&limit=0`, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Backend readiness failed for ${table}. Apply the app schema, grants and owner-only policies, and check your private key.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = parseDashboardConfig(fs.readFileSync(process.argv[2], 'utf8'));
    await checkBackend(config);
    // Normalize into a separate protected env file; never echo secrets.
    if (process.argv[3]) fs.writeFileSync(process.argv[3], Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    console.log('Backend tables reachable. Confirm owner-only policies and sign-in settings before exposing the dashboard.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Dashboard configuration check failed.');
    process.exitCode = 1;
  }
}