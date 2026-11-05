import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Play, RotateCw, Square, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Section, Stat, HashChart, fmtHash, fmtDuration } from "@/components/miner/parts";
import { StatusPill, TuningForm, SetupInstructions, UpdateBadge, UpdateButton, rigView } from "@/components/miner/rig-ui";
import { useBrowserRig } from "@/components/miner/browser-rig";
import { assetFor, type Tuning } from "@/lib/assets";
import {
  commandsQuery, controlRig, deleteRig, profilesQuery, rigsQuery, sendRigCommand, updateRig, type Rig,
} from "@/lib/miner-data";
import { rotateRigToken } from "@/lib/rigs.functions";

export const Route = createFileRoute("/_authenticated/dashboard/rigs/$rigId")({
  head: () => ({
    meta: [
      { title: "Rig — GYDS Miner" },
      { name: "description", content: "Control one mining rig: start, stop, restart, tuning and overclock." },
      { property: "og:title", content: "Rig — GYDS Miner" },
      { property: "og:description", content: "Control one mining rig: start, stop, restart, tuning and overclock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rigsQuery),
  component: RigDetail,
});

function RigDetail() {
  const { rigId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rotateFn = useServerFn(rotateRigToken);
  const { data: rigs } = useSuspenseQuery({ ...rigsQuery, refetchInterval: 5000 });
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const { data: commands } = useQuery({ ...commandsQuery(rigId), refetchInterval: 5000 });
  const browser = useBrowserRig();
  const [newToken, setNewToken] = useState<string | null>(null);
  const rig = rigs.find((r) => r.id === rigId);

  if (!rig) {
    return (
      <div className="panel p-6 text-center">
        <p>This rig doesn't exist anymore.</p>
        <Button asChild variant="link"><Link to="/dashboard">Back to rigs</Link></Button>
      </div>
    );
  }

  const isThis = rig.id === browser.rigId;
  const view = rigView(rig, isThis, browser.state.running);
  const s = isThis
    ? {
        hashRate: browser.state.hashRate, accepted: browser.state.validShares, rejected: browser.state.rejectedShares,
        reward: browser.state.totalReward, threads: browser.state.effectiveThreads,
        uptime: browser.state.startTime ? (Date.now() - browser.state.startTime) / 1000 : 0,
        history: browser.state.hashHistory.map((h) => h.hr), error: browser.state.lastError, devices: [],
      }
    : rig.stats;
  const log = isThis ? browser.state.log : rig.log;
  const profile = profiles.find((p) => p.id === rig.profile_id);
  const asset = profile ? assetFor(profile.coin) : null;
  const showGpu = rig.kind === "agent" && (profile?.device === "gpu" || (rig.hardware.gpus?.length ?? 0) > 0);
  const choosable = rig.kind === "browser" ? profiles.filter((p) => assetFor(p.coin).protocol === "gyds-rpc") : profiles;
  const running = isThis ? browser.state.running : rig.desired_state === "running";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: rigsQuery.queryKey });
    qc.invalidateQueries({ queryKey: commandsQuery(rigId).queryKey });
  };

  async function act(action: "start" | "stop" | "restart") {
    try {
      if (isThis) {
        const r = await browser.run(action);
        if (r.ok) toast.success(r.message); else toast.error(r.message);
      } else {
        await controlRig(rig!, action);
        toast.success(`${action} sent — the rig picks it up within ~10 seconds`);
      }
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function applyChange(patch: Partial<Rig>, command: "apply_tuning" | "set_profile") {
    try {
      await updateRig(rig!.id, patch);
      if (isThis) {
        const r = await browser.run(command);
        if (!r.ok) toast.error(r.message); else toast.success(r.message === "Saved — applies on next start." ? r.message : "Applied");
      } else {
        await sendRigCommand(rig!.id, command);
        toast.success("Saved — the rig applies it within ~10 seconds");
      }
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All rigs
      </Link>

      <Section title={rig.kind === "browser" ? "Browser rig" : "Rig program"} right={<StatusPill view={view} />}>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") || "").trim();
            if (name) { await updateRig(rig.id, { name }); refresh(); toast.success("Renamed"); }
          }}
        >
          <Input name="name" defaultValue={rig.name} aria-label="Rig name" />
          <Button type="submit" variant="outline">Rename</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {[rig.platform, rig.hostname, rig.agent_version && `v${rig.agent_version}`].filter(Boolean).join(" · ") || "Waiting for the rig to connect…"}
          {rig.last_seen_at && !isThis && ` · last seen ${new Date(rig.last_seen_at).toLocaleTimeString()}`}
        </p>
        <div className="mt-2"><UpdateBadge rig={rig} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="glow" onClick={() => act("start")} disabled={running}><Play /> Start</Button>
          <Button variant="secondary" onClick={() => act("restart")}><RotateCw /> Restart</Button>
          <Button variant="destructive" onClick={() => act("stop")} disabled={!running}><Square /> Stop</Button>
          <UpdateButton rig={rig} onSent={refresh} />
        </div>
        {s.error && <p className="mt-3 rounded-lg border border-destructive/40 bg-inset p-3 text-sm text-destructive">{s.error}</p>}
        {isThis && (
          <label className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-inset p-3 text-sm">
            <span>
              Allow my other devices to start mining here
              <span className="block text-xs text-muted-foreground">Mining only runs while this tab stays open.</span>
            </span>
            <Switch checked={browser.remoteAllowed} onCheckedChange={browser.setRemoteAllowed} />
          </label>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Hash rate" value={fmtHash(view.online ? Number(s.hashRate ?? 0) : 0)} />
        <Stat label="Accepted" value={s.accepted ?? 0} tone="plain" />
        <Stat label="Rejected" value={s.rejected ?? 0} tone={s.rejected ? "danger" : "plain"} />
        <Stat label="Uptime" value={fmtDuration(Number(s.uptime ?? 0))} tone="plain" />
      </div>

      <Section title="Hash rate" right={<span className="font-mono text-xs text-muted-foreground">{s.threads ?? 0} thread(s)</span>}>
        <HashChart history={s.history ?? []} />
      </Section>

      <Section title="Hardware">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">CPU</dt><dd className="font-mono">{rig.hardware.cpuModel ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Cores</dt><dd className="font-mono">{rig.hardware.cpus ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Memory</dt><dd className="font-mono">{rig.hardware.memGb ? `${rig.hardware.memGb} GB` : "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">GPUs</dt><dd className="font-mono">{rig.hardware.gpus?.length ?? 0}</dd></div>
        </dl>
        {(rig.stats.devices?.length ?? 0) > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-muted-foreground"><tr><th className="py-1">Device</th><th>Hash</th><th>Temp</th><th>Power</th><th>Fan</th></tr></thead>
              <tbody>
                {rig.stats.devices!.map((d, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5">{d.name}</td>
                    <td className="text-signal">{d.hashRate != null ? fmtHash(d.hashRate) : "—"}</td>
                    <td>{d.temp != null ? `${d.temp}°C` : "—"}</td>
                    <td>{d.power != null ? `${d.power} W` : "—"}</td>
                    <td>{d.fan != null ? `${d.fan}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(rig.hardware.gpus?.length ?? 0) > 0 && !(rig.stats.devices?.length) && (
          <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
            {rig.hardware.gpus!.map((g, i) => <li key={i}>GPU {i}: {g.name}{g.memMb ? ` · ${Math.round(g.memMb / 1024)} GB` : ""}</li>)}
          </ul>
        )}
      </Section>

      <Section title="Mining profile">
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Mining profile"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={rig.profile_id ?? ""}
            onChange={(e) => applyChange({ profile_id: e.target.value || null }, "set_profile")}
          >
            <option value="">None</option>
            {choosable.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.coin})</option>)}
          </select>
          <Button asChild variant="outline"><Link to="/dashboard/profiles">Edit coins &amp; pools</Link></Button>
        </div>
        {rig.kind === "browser" && (
          <p className="mt-2 text-xs text-muted-foreground">Browsers can only mine GYDS-style networks. Other coins need the rig program.</p>
        )}
        {asset && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {asset.requirements.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </Section>

      <Section title="Speed & overclock">
        <TuningForm
          key={JSON.stringify(rig.tuning)}
          tuning={rig.tuning}
          showGpu={showGpu}
          onSave={(t: Tuning) => applyChange({ tuning: t }, "apply_tuning")}
        />
      </Section>

      <Section title="Activity log">
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {log.slice(-100).join("\n") || "No activity yet."}
        </pre>
      </Section>

      {!isThis && (
        <Section title="Recent commands">
          <ul className="space-y-1 font-mono text-xs">
            {(commands ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-1.5">
                <span>{c.command}</span>
                <span className={c.status === "failed" ? "text-destructive" : c.status === "done" ? "text-signal" : "text-muted-foreground"}>
                  {c.status}{c.result ? ` — ${c.result}` : ""}
                </span>
              </li>
            ))}
            {!commands?.length && <li className="text-muted-foreground">None yet.</li>}
          </ul>
        </Section>
      )}

      <Section title="Manage">
        <div className="flex flex-wrap gap-2">
          {rig.kind === "agent" && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!confirm("Create a new token? The old one stops working right away.")) return;
                try { const r = await rotateFn({ data: { id: rig.id } }); setNewToken(r.token); }
                catch (e) { toast.error((e as Error).message); }
              }}
            >
              <KeyRound /> New setup token
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={async () => {
              if (!confirm(`Remove ${rig.name}?`)) return;
              if (isThis) await browser.run("stop");
              await deleteRig(rig.id);
              await qc.invalidateQueries({ queryKey: rigsQuery.queryKey });
              navigate({ to: "/dashboard" });
            }}
          >
            <Trash2 /> Remove rig
          </Button>
        </div>
      </Section>

      <Dialog open={!!newToken} onOpenChange={(v) => !v && setNewToken(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New setup for {rig.name}</DialogTitle></DialogHeader>
          {newToken && <SetupInstructions token={newToken} name={rig.name} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
