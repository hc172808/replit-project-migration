import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { LogOut, Play, Plug, Square, TriangleAlert, OctagonX, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";
import { minerRpc, testRpcEndpoints } from "@/lib/miner-rpc.functions";
import {
  settingsQuery, endpointsQuery, statsQuery, saveSettings, addEndpoint, updateEndpoint,
  deleteEndpoint, recordStats, type Settings,
} from "@/lib/miner-data";
import { MiningEngine, MAX_RECONNECT_ATTEMPTS, computeEffectiveThreads, type MinerConfig } from "@/lib/mining/engine";
import {
  Section, Stat, HashChart, WalletForm, EndpointList, MiningSettingsForm, fmtHash, fmtDuration,
} from "@/components/miner/parts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — GYDS Miner" },
      { name: "description", content: "Control your browser GYDS miner: hash rate, shares, rewards and node settings." },
      { property: "og:title", content: "Dashboard — GYDS Miner" },
      { property: "og:description", content: "Control your browser GYDS miner: hash rate, shares, rewards and node settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(settingsQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(endpointsQuery),
      context.queryClient.ensureQueryData(statsQuery),
    ]);
  },
  component: Dashboard,
});

function toConfig(s: Settings): MinerConfig {
  return {
    walletAddress: s.wallet_address,
    miningMode: s.mining_mode,
    workerName: s.worker_name,
    threads: s.threads,
    overclock: s.overclock,
    batchSize: s.batch_size,
    batchDelayMs: s.batch_delay_ms,
  };
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rpcFn = useServerFn(minerRpc);
  const testFn = useServerFn(testRpcEndpoints);

  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: endpoints } = useSuspenseQuery(endpointsQuery);

  const [engine] = useState(
    () =>
      new MiningEngine(
        (method, params, preferredIdx) => rpcFn({ data: { method: method as "mining_connect", params, preferredIdx } }),
        recordStats,
      ),
  );
  const st = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.state,
    () => engine.state,
  );

  const { data: stats } = useQuery({ ...statsQuery, refetchInterval: st.running ? 10000 : false });
  const [cores, setCores] = useState(0);
  const [memGb, setMemGb] = useState<number | null>(null);
  const [platform, setPlatform] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setCores(navigator.hardwareConcurrency || 1);
    setMemGb((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null);
    setPlatform(navigator.userAgent.includes("Android") ? "Android" : navigator.platform || "Browser");
    engine.pushLog("Dashboard ready. Press Start to begin mining in this tab.");
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); engine.destroy(); };
  }, [engine]);

  useEffect(() => {
    if (!st.running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [st.running]);

  const effThreads = st.running ? st.effectiveThreads : computeEffectiveThreads(settings.threads, settings.overclock, cores || 1);
  const uptime = st.startTime ? Math.floor((now - st.startTime) / 1000) : 0;
  const reconnectIn = st.reconnectAt ? Math.max(0, Math.ceil((st.reconnectAt - now) / 1000)) : null;
  const perThread = effThreads > 0 ? st.hashRate / effThreads : 0;

  const status = useMemo(() => {
    if (st.circuitOpen) return { label: "Stopped", tone: "danger" as const };
    if (st.reconnecting) return { label: "Reconnecting…", tone: "warn" as const };
    if (st.running) return { label: "Mining", tone: "on" as const };
    return { label: "Idle", tone: "off" as const };
  }, [st.circuitOpen, st.reconnecting, st.running]);

  async function restartIfRunning(fresh: Settings) {
    if (!engine.state.running) return;
    await engine.stop();
    const r = await engine.start(toConfig(fresh));
    if (!r.ok) toast.error(r.message);
  }

  async function onSaveSettings(patch: Partial<Settings>, label: string) {
    try {
      await saveSettings(patch);
      const fresh = await qc.fetchQuery({ ...settingsQuery, staleTime: 0 });
      engine.pushLog(label);
      toast.success("Saved");
      await restartIfRunning(fresh);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function refreshEndpoints() {
    await qc.invalidateQueries({ queryKey: endpointsQuery.queryKey });
  }

  async function start() {
    const r = await engine.start(toConfig(settings));
    if (r.ok) toast.success(r.message); else toast.error(r.message);
  }
  async function stop() {
    const r = await engine.stop();
    if (!r.ok) toast.error(r.message);
    qc.invalidateQueries({ queryKey: statsQuery.queryKey });
  }

  async function test(id?: string) {
    engine.pushLog(id ? "Testing endpoint…" : "Testing all endpoints…");
    try {
      const { results } = await testFn({ data: { id } });
      if (!results.length) engine.pushLog("No endpoints to test.");
      for (const r of results) {
        engine.pushLog(r.ok ? `✓ "${r.label}" reachable (${r.latency} ms)` : `✗ "${r.label}": ${r.error}`);
      }
      const bad = results.filter((r) => !r.ok).length;
      if (bad) toast.error(`${bad} of ${results.length} endpoint(s) failed — see Activity log`);
      else if (results.length) toast.success("All endpoints reachable");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function signOut() {
    if (engine.state.running) await engine.stop();
    engine.destroy();
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-lg font-bold leading-tight">GYDS Miner</h1>
            <p className="text-xs text-muted-foreground">
              {st.poolName ?? (settings.mining_mode === "solo" ? "Solo mode" : "Pool mode")} · {settings.worker_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              status.tone === "on" && "bg-accent text-signal",
              status.tone === "off" && "bg-muted text-muted-foreground",
              status.tone === "warn" && "bg-muted text-warning",
              status.tone === "danger" && "bg-muted text-destructive",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status.tone === "on" && "animate-pulse-dot")} />
            {status.label}
          </span>
          <Button size="icon" variant="ghost" aria-label="Sign out" onClick={signOut}><LogOut /></Button>
        </div>
      </header>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-inset p-3 text-xs text-muted-foreground">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>Mining uses this device's processor only while this tab stays open. Closing or sleeping the tab stops it. Phones may get warm and use more battery.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Hash rate" value={fmtHash(st.hashRate)} />
        <Stat label="Valid shares" value={st.validShares} />
        <Stat label="Rejected" value={st.rejectedShares} tone={st.rejectedShares ? "danger" : "plain"} />
        <Stat label="Session reward" value={st.totalReward.toLocaleString(undefined, { maximumFractionDigits: 6 })} />
        <Stat label="Block height" value={st.blockHeight || "—"} tone="plain" />
        <Stat label="Uptime" value={fmtDuration(uptime)} tone="plain" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Section title="Controls" right={<span className="font-mono text-xs text-muted-foreground">{effThreads} thread(s)</span>}>
            <div className="flex flex-wrap gap-2">
              <Button variant="glow" onClick={start} disabled={st.running || st.actionInProgress}><Play /> Start mining</Button>
              <Button variant="destructive" onClick={stop} disabled={(!st.running && !st.reconnecting) || st.actionInProgress}><Square /> Stop</Button>
              <Button variant="outline" onClick={() => test()}><Plug /> Test connection</Button>
            </div>
            {st.reconnecting && reconnectIn !== null && (
              <p className="mt-3 flex items-center gap-2 text-sm text-warning">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Next reconnect attempt in {reconnectIn}s ({st.reconnectAttempt + 1}/{MAX_RECONNECT_ATTEMPTS})
              </p>
            )}
            {st.circuitOpen && (
              <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
                <OctagonX className="mt-0.5 h-4 w-4 shrink-0" />
                Auto-reconnect gave up after {MAX_RECONNECT_ATTEMPTS} failed attempts. Press Start mining to try again.
              </p>
            )}
            {st.lastError && !st.running && (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-inset p-3 text-sm text-destructive">{st.lastError}</p>
            )}
          </Section>

          <Section
            title="Hash rate"
            right={<span className="font-mono text-xs text-muted-foreground">per thread {fmtHash(perThread)}</span>}
          >
            <HashChart history={st.hashHistory} />
          </Section>

          <Section title="Wallet">
            <WalletForm
              key={settings.wallet_address + settings.mining_mode}
              settings={settings}
              onSave={(p) => onSaveSettings(p, `Wallet updated: ${(p.wallet_address || "(none)").slice(0, 10)}…`)}
            />
          </Section>

          <Section title="RPC endpoints">
            <EndpointList
              endpoints={endpoints}
              activeId={st.activeEndpointId}
              onAdd={async (d) => {
                try { await addEndpoint({ ...d, position: endpoints.length }); await refreshEndpoints(); toast.success("Endpoint added"); }
                catch (e) { toast.error((e as Error).message); }
              }}
              onUpdate={async (id, d) => {
                try { await updateEndpoint(id, d); await refreshEndpoints(); toast.success("Endpoint saved"); }
                catch (e) { toast.error((e as Error).message); }
              }}
              onDelete={async (id) => {
                try { await deleteEndpoint(id); await refreshEndpoints(); }
                catch (e) { toast.error((e as Error).message); }
              }}
              onMove={async (idx, dir) => {
                const list = [...endpoints];
                const [moved] = list.splice(idx, 1);
                list.splice(idx + dir, 0, moved);
                try {
                  await Promise.all(list.map((e, i) => (e.position === i ? null : updateEndpoint(e.id, { position: i }))));
                  engine.state.activeEndpointIdx = 0;
                  await refreshEndpoints();
                } catch (e) { toast.error((e as Error).message); }
              }}
              onTest={(id) => test(id)}
            />
          </Section>

          <Section title="Mining settings">
            <MiningSettingsForm
              key={JSON.stringify([settings.worker_name, settings.threads, settings.overclock, settings.batch_size, settings.batch_delay_ms])}
              settings={settings}
              cores={cores || 1}
              onSave={(p) => onSaveSettings(p, `Config: threads=${p.threads}, batch=${p.batch_size}, delay=${p.batch_delay_ms}ms, overclock=${p.overclock}×`)}
            />
          </Section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Section title="Lifetime stats">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Total shares", stats?.lifetime_shares ?? 0],
                ["Total rejected", stats?.lifetime_rejected ?? 0],
                ["Total reward", (stats?.lifetime_reward ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 })],
                ["Mining time", fmtDuration(stats?.lifetime_mining_seconds ?? 0)],
                ["Sessions", stats?.total_sessions ?? 0],
                ["First started", stats?.first_started ? new Date(stats.first_started).toLocaleDateString() : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-mono font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="This device">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">CPU cores</dt><dd className="font-mono font-semibold">{cores || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Memory</dt><dd className="font-mono font-semibold">{memGb ? `~${memGb} GB` : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Platform</dt><dd className="font-mono font-semibold">{platform || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Difficulty</dt><dd className="font-mono font-semibold">{st.currentDifficulty ?? "—"}</dd></div>
            </dl>
          </Section>

          <Section title="Activity log" right={<Button size="sm" variant="ghost" onClick={() => engine.clearLog()}>Clear</Button>}>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {st.log.slice(-100).join("\n") || "No activity yet."}
            </pre>
          </Section>
        </div>
      </div>
    </main>
  );
}
