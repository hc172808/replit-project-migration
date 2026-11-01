// Browser data access for the signed-in user's miner settings, endpoints
// and lifetime stats. Row-level security limits every query to the caller.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_ENDPOINTS = [
  { label: "Primary", url: "https://rpc.nelifegy.com" },
  { label: "Fallback", url: "https://netlifegy.com/api/mining/rpc" },
];

export type Settings = {
  user_id: string;
  wallet_address: string;
  mining_mode: "pool" | "solo";
  worker_name: string;
  threads: number;
  overclock: number;
  batch_size: number;
  batch_delay_ms: number;
};

export type EndpointRow = {
  id: string;
  label: string;
  url: string;
  cf_client_id: string;
  has_cf_secret: boolean;
  position: number;
};

export type StatsRow = {
  lifetime_shares: number;
  lifetime_rejected: number;
  lifetime_reward: number;
  lifetime_mining_seconds: number;
  total_sessions: number;
  first_started: string | null;
};

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export const settingsQuery = queryOptions({
  queryKey: ["miner", "settings"],
  queryFn: async (): Promise<Settings> => {
    const userId = await requireUserId();
    const { data, error } = await supabase.from("miner_settings").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (data) return { ...data, overclock: Number(data.overclock), mining_mode: data.mining_mode as "pool" | "solo" };

    // First visit: create default settings, and seed the default GYDS nodes once.
    const { error: insErr } = await supabase.from("miner_settings").insert({ user_id: userId });
    if (!insErr) {
      await supabase.from("rpc_endpoints").insert(
        DEFAULT_ENDPOINTS.map((e, i) => ({ ...e, user_id: userId, position: i })),
      );
    } else if (insErr.code !== "23505") {
      throw insErr;
    }
    const again = await supabase.from("miner_settings").select("*").eq("user_id", userId).single();
    if (again.error) throw again.error;
    return { ...again.data, overclock: Number(again.data.overclock), mining_mode: again.data.mining_mode as "pool" | "solo" };
  },
});

export const endpointsQuery = queryOptions({
  queryKey: ["miner", "endpoints"],
  queryFn: async (): Promise<EndpointRow[]> => {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("rpc_endpoints")
      .select("id, label, url, cf_client_id, has_cf_secret, position")
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((e) => ({ ...e, has_cf_secret: !!e.has_cf_secret }));
  },
});

export const statsQuery = queryOptions({
  queryKey: ["miner", "stats"],
  queryFn: async (): Promise<StatsRow | null> => {
    const userId = await requireUserId();
    const { data, error } = await supabase.from("miner_stats").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? { ...data, lifetime_reward: Number(data.lifetime_reward) } : null;
  },
});

export async function saveSettings(patch: Partial<Omit<Settings, "user_id">>) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("miner_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function addEndpoint(e: { label: string; url: string; cf_client_id: string; cf_client_secret: string; position: number }) {
  const userId = await requireUserId();
  const { error } = await supabase.from("rpc_endpoints").insert({ ...e, user_id: userId });
  if (error) throw error;
}

export async function updateEndpoint(
  id: string,
  patch: { label?: string; url?: string; cf_client_id?: string; cf_client_secret?: string; position?: number },
) {
  const { error } = await supabase.from("rpc_endpoints").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteEndpoint(id: string) {
  const { error } = await supabase.from("rpc_endpoints").delete().eq("id", id);
  if (error) throw error;
}

export async function recordStats(d: { shares?: number; rejected?: number; reward?: number; seconds?: number; newSession?: boolean }) {
  const { error } = await supabase.rpc("record_miner_stats", {
    _shares: d.shares ?? 0,
    _rejected: d.rejected ?? 0,
    _reward: d.reward ?? 0,
    _seconds: d.seconds ?? 0,
    _new_session: d.newSession ?? false,
  });
  if (error) console.error("record_miner_stats", error);
}
