<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Browser mining runs only in the signed-in user's tab via Web Workers, explicitly started by the user; never run mining on Lovable hosting because it cannot host long CPU jobs.
- The separately installed rig agent runs on owner-controlled hardware and persists the desired mining state through dashboard outages and service restarts so it keeps mining until Stop.
- Rig updates use a durable local event journal acknowledged by the heartbeat and owner-readable history; success is reported after replacement startup to avoid false installation claims.
- The PWA service worker is online-only and never caches pages or API responses to avoid persisting private rig data or stale releases.
- Wallet challenges are bound to the requesting host and issued message, and consumed atomically after signature verification to prevent replay and concurrent sign-ins.
- Rig log diagnosis verifies rig ownership before calling AI, redacts common credentials, and treats submitted logs as untrusted evidence; analysis never applies rig commands.
- All GYDS RPC calls go through the `minerRpc` server function so Cloudflare Access secrets stay server-side; the browser can write `rpc_endpoints.cf_client_secret` but column grants block reading it back.
- The hash rule in `src/lib/mining/hash.ts` must stay byte-identical to the original miner (sha256 of prevHash+address+decimal nonce, share when hash < target); tests in `src/test/mining-rules.test.ts` lock it.
