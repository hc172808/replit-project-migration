import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Play, Plus, RotateCw, Square, ChevronRight, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Stat, fmtHash, fmtDuration } from "@/components/miner/parts";
import { rigMonitoring } from "@/lib/rig-monitoring";
import { AddRigDialog, StatusPill, UpdateBadge, UpdateButton, rigView } from "@/components/miner/rig-ui";
import { useBrowserRig } from "@/components/miner/browser-rig";
import { controlRig, profilesQuery, rigsQuery, statsQuery, type Rig } from "@/lib/miner-data";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Rigs — GYDS Miner" },
      { name: "description", content: "Every mining rig you own in one place: hash rate, shares, temperatures and controls." },
      { property: "og:title", content: "Rigs — GYDS Miner" },
      { property: "og:description", content: "Every mining rig you own in one place: hash rate, shares, temperatures and controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rigsQuery),
  component: Fleet,
});

function Fleet() {
  const qc = useQueryClient();
  const { data: rigs } = useSuspenseQuery({ ...rigsQuery, refetchInterval: 5000 });
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const { data: stats } = useQuery(statsQuery);
  const browser = useBrowserRig();
  const [adding, setAdding] = useState(false);

  const live = (r: Rig) => (r.id === browser.rigId
    ? { hashRate: browser.state.hashRate, accepted: browser.state.validShares, rejected: browser.state.rejectedShares,
        uptime: browser.state.running && browser.state.startTime ? (Date.now() - browser.state.startTime) / 1000 : 0 }
    : r.stats);
  const views = rigs.map((r) => ({ rig: r, view: rigView(r, r.id === browser.rigId, browser.state.running), s: live(r) }));
  const online = views.filter((v) => v.view.online).length;
  const totalHash = views.reduce((a, v) => a + (v.view.online ? Number(v.s.hashRate ?? 0) : 0), 0);
  const totalAccepted = views.reduce((a, v) => a + Number(v.s.accepted ?? 0), 0);

  async function act(r: Rig, action: "start" | "stop" | "restart") {
    try {
      if (r.id === browser.rigId) {
        const res = await browser.run(action);
        if (res.ok) toast.success(res.message); else toast.error(res.message);
      } else {
        await controlRig(r, action);
        toast.success(`${action.charAt(0).toUpperCase()}${action.slice(1)} sent to ${r.name}`);
      }
      qc.invalidateQueries({ queryKey: rigsQuery.queryKey });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rigs online" value={`${online}/${rigs.length}`} />
        <Stat label="Total hash rate" value={fmtHash(totalHash)} />
        <Stat label="Accepted (session)" value={totalAccepted} tone="plain" />
        <Stat label="Browser lifetime" value={stats?.lifetime_shares ?? 0} tone="plain" />
      </div>

      <Section
        title="Your rigs"
        right={<Button size="sm" variant="glow" onClick={() => setAdding(true)}><Plus /> Add rig</Button>}
      >
        <ul className="space-y-2">
          {views.map(({ rig, view, s }) => {
            const profile = profiles.find((p) => p.id === rig.profile_id);
            const hot = (rig.stats.devices ?? []).reduce((m, d) => Math.max(m, d.temp ?? 0), 0);
            const isThis = rig.id === browser.rigId;
            const monitoring = rigMonitoring(rig.last_seen_at, s.uptime);
            const running = isThis ? browser.state.running : rig.desired_state === "running";
            return (
              <li key={rig.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/dashboard/rigs/$rigId" params={{ rigId: rig.id }} className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {rig.name}
                      {isThis && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">this device</span>}
                      <StatusPill view={view} />
                      <UpdateBadge rig={rig} />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {rig.kind === "browser" ? "Browser" : "Rig program"} · {rig.platform || "not connected yet"}
                      {profile ? ` · ${profile.coin}` : " · no profile"}
                    </p>
                  </Link>
                  <Link to="/dashboard/rigs/$rigId" params={{ rigId: rig.id }} aria-label={`Manage ${rig.name}`}>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                  <span className="text-signal">{fmtHash(view.online ? Number(s.hashRate ?? 0) : 0)}</span>
                  <span className="text-muted-foreground">✓ {s.accepted ?? 0}</span>
                  <span className="text-muted-foreground">✗ {s.rejected ?? 0}</span>
                  {hot > 0 && <span className="flex items-center gap-1 text-muted-foreground"><Thermometer className="h-3 w-3" />{hot}°C</span>}
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Connection</dt><dd className={view.online ? "text-signal" : "text-muted-foreground"}>{view.online ? "Online" : "Offline"}</dd></div>
                  <div><dt className="text-muted-foreground">Mining uptime{!view.online ? " (last reported)" : ""}</dt><dd className="font-mono">{fmtDuration(monitoring.miningSeconds)}</dd></div>
                  <div><dt className="text-muted-foreground">Last check-in</dt><dd>{isThis ? "This tab is connected" : monitoring.lastCheckIn}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => act(rig, "start")} disabled={running}><Play /> Start</Button>
                  <Button size="sm" variant="secondary" onClick={() => act(rig, "restart")}><RotateCw /> Restart</Button>
                  <Button size="sm" variant="destructive" onClick={() => act(rig, "stop")} disabled={!running}><Square /> Stop</Button>
                  <UpdateButton rig={rig} size="sm" onSent={() => qc.invalidateQueries({ queryKey: rigsQuery.queryKey })} />
                </div>
              </li>
            );
          })}
        </ul>
        {rigs.filter((r) => r.kind === "agent").length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Add your servers, PCs and phones to mine Monero, GPU coins, Bitcoin and more, and control them all from here.
          </p>
        )}
      </Section>

      <AddRigDialog
        open={adding}
        onOpenChange={setAdding}
        profiles={profiles}
        onCreated={() => qc.invalidateQueries({ queryKey: rigsQuery.queryKey })}
      />
    </div>
  );
}
