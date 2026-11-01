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
- Mining runs only in the signed-in user's browser via Web Workers (`src/lib/mining/`), started explicitly by the user; never mine on the server or auto-start — server hosting can't run long CPU jobs and visitors must opt in.
- All GYDS RPC calls go through the `minerRpc` server function so Cloudflare Access secrets stay server-side; the browser can write `rpc_endpoints.cf_client_secret` but column grants block reading it back.
- The hash rule in `src/lib/mining/hash.ts` must stay byte-identical to the original miner (sha256 of prevHash+address+decimal nonce, share when hash < target); tests in `src/test/mining-rules.test.ts` lock it.
