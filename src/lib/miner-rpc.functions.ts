// Server-side proxy for the GYDS mining JSON-RPC. Keeps each endpoint's
// Cloudflare Access secret on the server and preserves the original miner's
// ordered failover and error messages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateRpcUrl } from "@/lib/mining/url";

const ALLOWED_METHODS = [
  "mining_connect",
  "mining_getWork",
  "mining_submitShare",
  "mining_disconnect",
  "mining_getStats",
  "mining_getInfo",
] as const;

type Endpoint = {
  id: string;
  label: string;
  url: string;
  cf_client_id: string;
  cf_client_secret: string;
};

async function loadEndpoints(userId: string, profileId: string): Promise<Endpoint[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("rpc_endpoints")
    .select("id, label, url, cf_client_id, cf_client_secret")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) {
    console.error("loadEndpoints", error);
    throw new Error("Could not load your RPC endpoints.");
  }
  return (data ?? []).filter((e) => e.url);
}

function headersFor(ep: Endpoint): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ep.cf_client_id) h["CF-Access-Client-Id"] = ep.cf_client_id;
  if (ep.cf_client_secret) h["CF-Access-Client-Secret"] = ep.cf_client_secret;
  return h;
}

let rpcId = 1;

async function callEndpoint(ep: Endpoint, method: string, params: unknown): Promise<unknown> {
  validateRpcUrl(ep.url);
  let res: Response;
  try {
    res = await fetch(ep.url, {
      method: "POST",
      headers: headersFor(ep),
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: rpcId++ }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const e = err as Error;
    throw new Error(
      e.name === "TimeoutError" || e.name === "AbortError"
        ? `[${ep.label}] Timed out — is "${ep.url}" reachable?`
        : `[${ep.label}] Cannot reach "${ep.url}". (${e.message})`,
    );
  }
  if (res.redirected && (res.url || "").includes("cloudflareaccess.com"))
    throw new Error(`[${ep.label}] Blocked by Cloudflare Access — set CF Service Token for this endpoint.`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html"))
    throw new Error(`[${ep.label}] Returned HTML — likely Cloudflare Access. Set CF Service Token.`);
  if (res.status === 401) throw new Error(`[${ep.label}] 401 Unauthorized.`);
  if (res.status === 403) throw new Error(`[${ep.label}] 403 Forbidden.`);
  if (!res.ok) throw new Error(`[${ep.label}] HTTP ${res.status}.`);
  let body: { result?: unknown; error?: { message?: string } };
  try {
    body = await res.json();
  } catch {
    throw new Error(`[${ep.label}] Response is not valid JSON.`);
  }
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

export const minerRpc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        method: z.enum(ALLOWED_METHODS),
        params: z.record(z.string(), z.unknown()),
        preferredIdx: z.number().int().min(0).max(100),
        profileId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const endpoints = await loadEndpoints(context.userId, data.profileId);
    if (!endpoints.length) {
      return {
        ok: false as const,
        error: "No node endpoints in this profile. Add one under Profiles.",
        notes: [] as string[],
        activeIdx: 0,
      };
    }
    const notes: string[] = [];
    let lastError = "Unknown error";
    const start = data.preferredIdx % endpoints.length;
    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      const idx = (start + attempt) % endpoints.length;
      const ep = endpoints[idx]!;
      try {
        const result = await callEndpoint(ep, data.method, data.params);
        if (attempt > 0) notes.push(`✓ Failover: now using "${ep.label}" (${ep.url})`);
        return {
          ok: true as const,
          resultJson: JSON.stringify(result ?? null),
          activeIdx: idx,
          activeEndpointId: ep.id,
          notes,
        };
      } catch (err) {
        lastError = (err as Error).message;
        if (attempt < endpoints.length - 1)
          notes.push(`⚠ "${ep.label}" failed — trying next endpoint… (${lastError})`);
      }
    }
    return { ok: false as const, error: lastError, notes, activeIdx: start };
  });

async function probeEndpoint(ep: Endpoint) {
  try {
    validateRpcUrl(ep.url);
  } catch (e) {
    return { ok: false, error: (e as Error).message, latency: 0 };
  }
  const t0 = Date.now();
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: headersFor(ep),
      body: JSON.stringify({ jsonrpc: "2.0", method: "mining_getInfo", params: {}, id: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - t0;
    if (res.redirected && (res.url || "").includes("cloudflareaccess.com"))
      return { ok: false, error: "Blocked by Cloudflare Access — set CF Service Token.", latency };
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html"))
      return { ok: false, error: "Returned HTML — likely Cloudflare Access login.", latency };
    if (res.status === 401) return { ok: false, error: "401 Unauthorized.", latency };
    if (res.status === 403) return { ok: false, error: "403 Forbidden.", latency };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, latency };
    return { ok: true, latency, error: null as string | null };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      latency: Date.now() - t0,
      error:
        e.name === "TimeoutError" || e.name === "AbortError"
          ? "Timed out after 10s — server unreachable or too slow."
          : `Network error: ${e.message}`,
    };
  }
}

export const testRpcEndpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ profileId: z.string().uuid(), id: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const all = await loadEndpoints(context.userId, data.profileId);
    const targets = data.id ? all.filter((e) => e.id === data.id) : all;
    const results: { id: string; label: string; url: string; ok: boolean; latency: number; error: string | null }[] = [];
    for (let i = 0; i < targets.length; i += 5) {
      const chunk = targets.slice(i, i + 5);
      const out = await Promise.all(
        chunk.map(async (ep) => {
          const r = await probeEndpoint(ep);
          return { id: ep.id, label: ep.label, url: ep.url, ok: r.ok, latency: r.latency, error: r.error ?? null };
        }),
      );
      results.push(...out);
    }
    return { results };
  });
