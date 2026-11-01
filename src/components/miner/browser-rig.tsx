// "This browser" rig: owns the in-tab mining engine, registers this device as
// a rig, reports its stats every 10s and runs commands sent from any of the
// user's devices. Remote start needs the per-device "allow remote control"
// switch; stop always works.
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { minerRpc } from "@/lib/miner-rpc.functions";
import { MiningEngine, type MinerConfig, type MinerState } from "@/lib/mining/engine";
import { assetFor, clampTuning } from "@/lib/assets";
import { recordStats, requireUserId, rigsQuery, statsQuery, updateRig, type MiningProfile } from "@/lib/miner-data";

type Action = "start" | "stop" | "restart" | "apply_tuning" | "set_profile";

type Ctx = {
  engine: MiningEngine;
  state: MinerState;
  rigId: string | null;
  remoteAllowed: boolean;
  setRemoteAllowed: (v: boolean) => void;
  run: (action: Action) => Promise<{ ok: boolean; message: string }>;
};

const BrowserRigContext = createContext<Ctx | null>(null);

export function useBrowserRig() {
  const c = useContext(BrowserRigContext);
  if (!c) throw new Error("useBrowserRig outside provider");
  return c;
}

function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Browser";
}

async function loadConfig(rigId: string): Promise<MinerConfig> {
  const { data: rig, error } = await supabase.from("rigs").select("profile_id, tuning, name").eq("id", rigId).single();
  if (error) throw new Error("This browser rig was removed. Reload the page.");
  if (!rig.profile_id) throw new Error("Pick a mining profile for this browser first.");
  const { data: p } = await supabase.from("mining_profiles").select("*").eq("id", rig.profile_id).maybeSingle();
  if (!p) throw new Error("The selected mining profile no longer exists.");
  const profile = p as MiningProfile;
  if (assetFor(profile.coin).protocol !== "gyds-rpc")
    throw new Error(`${profile.coin} can't be mined in a browser. Use the rig program on a PC, server or phone.`);
  const t = clampTuning((rig.tuning ?? {}) as Record<string, unknown>);
  return {
    profileId: profile.id,
    walletAddress: profile.wallet_address,
    miningMode: profile.mining_mode,
    workerName: profile.worker_name || rig.name,
    threads: t.cpuThreads ?? 0,
    overclock: t.cpuOverclock ?? 1,
    batchSize: t.batchSize ?? 20000,
    batchDelayMs: t.batchDelayMs ?? 0,
  };
}

export function BrowserRigProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const rpcFn = useServerFn(minerRpc);
  const [engine] = useState(
    () =>
      new MiningEngine(
        (method, params, preferredIdx, profileId) =>
          rpcFn({ data: { method: method as "mining_connect", params, preferredIdx, profileId } }),
        recordStats,
      ),
  );
  const state = useSyncExternalStore((cb) => engine.subscribe(cb), () => engine.state, () => engine.state);
  const [rigId, setRigId] = useState<string | null>(null);
  const [remoteAllowed, setRemoteAllowedState] = useState(false);
  const busy = useRef(false);

  // Register (or find) this device's browser rig.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await requireUserId();
      const key = `gyds-browser-rig:${userId}`;
      setRemoteAllowedState(localStorage.getItem(`${key}:remote`) === "1");
      let id = localStorage.getItem(key);
      if (id) {
        const { data } = await supabase.from("rigs").select("id").eq("id", id).maybeSingle();
        if (!data) id = null;
      }
      if (!id) {
        const platform = detectPlatform();
        const { data: prof } = await supabase
          .from("mining_profiles").select("id, coin").eq("user_id", userId).order("created_at", { ascending: true });
        const firstBrowser = (prof ?? []).find((p) => assetFor(p.coin).protocol === "gyds-rpc");
        const { data: created, error } = await supabase
          .from("rigs")
          .insert({
            user_id: userId, kind: "browser", name: `Browser · ${platform}`, platform,
            profile_id: firstBrowser?.id ?? null,
            tuning: { cpuThreads: 0, cpuOverclock: 1, batchSize: 20000, batchDelayMs: 0 },
            hardware: { cpus: navigator.hardwareConcurrency || 1, memGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory },
          })
          .select("id")
          .single();
        if (error) { console.error(error); return; }
        id = created.id;
        localStorage.setItem(key, id);
      }
      if (!cancelled) {
        setRigId(id);
        qc.invalidateQueries({ queryKey: rigsQuery.queryKey });
      }
    })().catch((e) => console.error("browser rig", e));
    return () => { cancelled = true; };
  }, [qc]);

  const setRemoteAllowed = useCallback((v: boolean) => {
    setRemoteAllowedState(v);
    requireUserId().then((u) => localStorage.setItem(`gyds-browser-rig:${u}:remote`, v ? "1" : "0"));
  }, []);

  const run = useCallback(
    async (action: Action): Promise<{ ok: boolean; message: string }> => {
      if (!rigId) return { ok: false, message: "This browser isn't registered yet." };
      try {
        if (action === "stop") {
          await updateRig(rigId, { desired_state: "stopped" });
          const r = await engine.stop();
          qc.invalidateQueries({ queryKey: statsQuery.queryKey });
          return r;
        }
        if (action === "start" || action === "restart") {
          await updateRig(rigId, { desired_state: "running" });
          if (action === "restart" && engine.state.running) await engine.stop();
          return await engine.start(await loadConfig(rigId));
        }
        // apply_tuning / set_profile: restart only if running
        if (engine.state.running) {
          await engine.stop();
          return await engine.start(await loadConfig(rigId));
        }
        return { ok: true, message: "Saved — applies on next start." };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    [engine, rigId, qc],
  );

  // Heartbeat: report this browser's status to the fleet.
  useEffect(() => {
    if (!rigId) return;
    const beat = () => {
      const s = engine.state;
      void updateRig(rigId, {
        status: s.running ? (s.reconnecting ? "starting" : "mining") : s.lastError ? "error" : "idle",
        last_seen_at: new Date().toISOString(),
        stats: {
          hashRate: s.hashRate, accepted: s.validShares, rejected: s.rejectedShares, reward: s.totalReward,
          uptime: s.startTime ? Math.floor((Date.now() - s.startTime) / 1000) : 0,
          threads: s.effectiveThreads, blockHeight: s.blockHeight, ...(s.poolName ? { pool: s.poolName } : {}),
          error: s.lastError, history: s.hashHistory.slice(-60).map((h) => h.hr),
        },
        log: s.log.slice(-60),
      }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, 10_000);
    return () => clearInterval(t);
  }, [rigId, engine]);

  // Run commands sent to this browser from other devices.
  useEffect(() => {
    if (!rigId) return;
    const poll = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const { data: cmds } = await supabase
          .from("rig_commands").select("id, command").eq("rig_id", rigId).eq("status", "pending")
          .order("created_at", { ascending: true }).limit(10);
        for (const c of cmds ?? []) {
          await supabase.from("rig_commands").update({ status: "acked", updated_at: new Date().toISOString() }).eq("id", c.id);
          let r: { ok: boolean; message: string };
          if ((c.command === "start" || c.command === "restart") && !remoteAllowed) {
            r = { ok: false, message: "Remote start is turned off on that browser." };
            engine.pushLog("Ignored a remote start: remote control is off for this browser.");
          } else {
            engine.pushLog(`Remote command: ${c.command}`);
            r = await run(c.command as Action);
          }
          await supabase.from("rig_commands")
            .update({ status: r.ok ? "done" : "failed", result: r.message, updated_at: new Date().toISOString() })
            .eq("id", c.id);
        }
      } finally {
        busy.current = false;
      }
    };
    const t = setInterval(() => void poll(), 5000);
    return () => clearInterval(t);
  }, [rigId, run, remoteAllowed, engine]);

  useEffect(() => () => engine.destroy(), [engine]);

  useEffect(() => {
    if (!state.running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.running]);

  return (
    <BrowserRigContext.Provider value={{ engine, state, rigId, remoteAllowed, setRemoteAllowed, run }}>
      {children}
    </BrowserRigContext.Provider>
  );
}
