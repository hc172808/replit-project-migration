// Browser data access for the signed-in user's profiles, nodes, rigs,
// commands and stats. Row-level security limits every query to the caller.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tuning } from "@/lib/assets";

export const DEFAULT_ENDPOINTS = [
  { label: "Primary", url: "https://rpc.nelifegy.com" },
  { label: "Fallback", url: "https://netlifegy.com/api/mining/rpc" },
];

export type MiningProfile = {
  id: string;
  name: string;
  coin: string;
  algorithm: string;
  miner: string;
  device: "cpu" | "gpu" | "asic" | "browser";
  pool_url: string;
  wallet_address: string;
  worker_name: string;
  pool_password: string;
  mining_mode: "pool" | "solo";
  extra_args: string;
};

export type EndpointRow = {
  id: string;
  label: string;
  url: string;
  cf_client_id: string;
  has_cf_secret: boolean;
  position: number;
};

export type RigStats = {
  hashRate?: number;
  accepted?: number;
  rejected?: number;
  reward?: number;
  uptime?: number;
  threads?: number;
  blockHeight?: number;
  pool?: string;
  error?: string | null;
  history?: number[];
  devices?: { name: string; type: string; hashRate?: number; temp?: number; power?: number; fan?: number }[];
};

export type Rig = {
  id: string;
  name: string;
  kind: "agent" | "browser";
  platform: string;
  hostname: string;
  agent_version: string;
  status: string;
  desired_state: "running" | "stopped";
  profile_id: string | null;
  tuning: Tuning;
  hardware: { cpus?: number; cpuModel?: string; memGb?: number; gpus?: { name: string; memMb?: number }[] };
  stats: RigStats;
  log: string[];
  last_seen_at: string | null;
  created_at: string;
};

export type RigCommand = {
  id: string;
  command: string;
  payload: Record<string, unknown>;
  status: "pending" | "acked" | "done" | "failed";
  result: string;
  created_at: string;
};

export type StatsRow = {
  lifetime_shares: number;
  lifetime_rejected: number;
  lifetime_reward: number;
  lifetime_mining_seconds: number;
  total_sessions: number;
  first_started: string | null;
};

export async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

const RIG_COLS =
  "id, name, kind, platform, hostname, agent_version, status, desired_state, profile_id, tuning, hardware, stats, log, last_seen_at, created_at";

let seeding: Promise<void> | null = null;
async function seedDefaults(userId: string) {
  const { data: p, error } = await supabase
    .from("mining_profiles")
    .insert({ user_id: userId, name: "GYDS", coin: "GYDS", algorithm: "sha256-gyds", miner: "builtin", device: "browser", worker_name: "rig" })
    .select("id")
    .single();
  if (error) throw error;
  await supabase.from("rpc_endpoints").insert(
    DEFAULT_ENDPOINTS.map((e, i) => ({ ...e, user_id: userId, profile_id: p.id, position: i })),
  );
}

export const profilesQuery = queryOptions({
  queryKey: ["miner", "profiles"],
  queryFn: async (): Promise<MiningProfile[]> => {
    const userId = await requireUserId();
    const load = () =>
      supabase.from("mining_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    let { data, error } = await load();
    if (error) throw error;
    if (!data?.length) {
      seeding ??= seedDefaults(userId).finally(() => { seeding = null; });
      await seeding;
      ({ data, error } = await load());
      if (error) throw error;
    }
    return (data ?? []) as MiningProfile[];
  },
});

export const endpointsQuery = (profileId: string) =>
  queryOptions({
    queryKey: ["miner", "endpoints", profileId],
    queryFn: async (): Promise<EndpointRow[]> => {
      const { data, error } = await supabase
        .from("rpc_endpoints")
        .select("id, label, url, cf_client_id, has_cf_secret, position")
        .eq("profile_id", profileId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, has_cf_secret: !!e.has_cf_secret }));
    },
  });

export const rigsQuery = queryOptions({
  queryKey: ["miner", "rigs"],
  queryFn: async (): Promise<Rig[]> => {
    const userId = await requireUserId();
    const { data, error } = await supabase.from("rigs").select(RIG_COLS).eq("user_id", userId).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as Rig[];
  },
});

export const commandsQuery = (rigId: string) =>
  queryOptions({
    queryKey: ["miner", "commands", rigId],
    queryFn: async (): Promise<RigCommand[]> => {
      const { data, error } = await supabase
        .from("rig_commands")
        .select("id, command, payload, status, result, created_at")
        .eq("rig_id", rigId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RigCommand[];
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

export const accountQuery = queryOptions({
  queryKey: ["miner", "account"],
  queryFn: async () => {
    const userId = await requireUserId();
    const { data } = await supabase.from("profiles").select("username, wallet_address").eq("id", userId).maybeSingle();
    return data ?? { username: null, wallet_address: null };
  },
});

// ── Writes ─────────────────────────────────────────────────────────────
export async function createProfile(p: Omit<MiningProfile, "id">) {
  const userId = await requireUserId();
  const { data, error } = await supabase.from("mining_profiles").insert({ ...p, user_id: userId }).select("id").single();
  if (error) throw error;
  return data.id;
}
export async function updateProfile(id: string, p: Partial<Omit<MiningProfile, "id">>) {
  const { error } = await supabase.from("mining_profiles").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function deleteProfile(id: string) {
  const { error } = await supabase.from("mining_profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function addEndpoint(profileId: string, e: { label: string; url: string; cf_client_id: string; cf_client_secret: string; position: number }) {
  const userId = await requireUserId();
  const { error } = await supabase.from("rpc_endpoints").insert({ ...e, user_id: userId, profile_id: profileId });
  if (error) throw error;
}
export async function updateEndpoint(id: string, patch: { label?: string; url?: string; cf_client_id?: string; cf_client_secret?: string; position?: number }) {
  const { error } = await supabase.from("rpc_endpoints").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteEndpoint(id: string) {
  const { error } = await supabase.from("rpc_endpoints").delete().eq("id", id);
  if (error) throw error;
}

export async function updateRig(id: string, patch: Partial<Pick<Rig, "name" | "desired_state" | "profile_id" | "tuning" | "status" | "stats" | "log" | "last_seen_at" | "platform" | "hardware">>) {
  const { error } = await supabase.from("rigs").update(patch as never).eq("id", id);
  if (error) throw error;
}
export async function deleteRig(id: string) {
  const { error } = await supabase.from("rigs").delete().eq("id", id);
  if (error) throw error;
}

export async function sendRigCommand(rigId: string, command: "start" | "stop" | "restart" | "apply_tuning" | "set_profile" | "update", payload: Record<string, unknown> = {}) {
  const userId = await requireUserId();
  const { error } = await supabase.from("rig_commands").insert({ rig_id: rigId, user_id: userId, command, payload: payload as never });
  if (error) throw error;
}

/** Start/stop/restart from the dashboard: set desired state and queue the command. */
export async function controlRig(rig: Pick<Rig, "id">, action: "start" | "stop" | "restart") {
  if (action !== "restart") await updateRig(rig.id, { desired_state: action === "start" ? "running" : "stopped" });
  else await updateRig(rig.id, { desired_state: "running" });
  await sendRigCommand(rig.id, action);
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
