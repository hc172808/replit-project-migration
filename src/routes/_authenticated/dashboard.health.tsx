import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Stat } from "@/components/miner/parts";
import { UpdateBadge, UpdateButton } from "@/components/miner/rig-ui";
import { rigsQuery, sendRigCommand } from "@/lib/miner-data";
import { RIG_AGENT_VERSION } from "@/lib/rig-agent-version";
import { summariseRig } from "@/lib/rig-health";
import { explainRigHealth } from "@/lib/rig-health.functions";

export const Route = createFileRoute("/_authenticated/dashboard/health")({
  head: () => ({
    meta: [
      { title: "Rig health — GYDS Miner" },
      { name: "description", content: "See every rig's program version and update status, and get an AI explanation of which rigs need attention." },
      { property: "og:title", content: "Rig health — GYDS Miner" },
      { property: "og:description", content: "Versions, update status and an AI summary of which rigs need attention." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rigsQuery),
  component: Health,
});

function Bold({ line }: { line: string }) {
  const parts = line.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i} className="text-foreground">{p}</strong> : <Fragment key={i}>{p}</Fragment>))}</>;
}

function Health() {
  const qc = useQueryClient();
  const explainFn = useServerFn(explainRigHealth);
  const { data: rigs } = useSuspenseQuery({ ...rigsQuery, refetchInterval: 10000 });
  const [answer, setAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = rigs.map((r) => ({ rig: r, h: summariseRig(r) }));
  const agents = rows.filter((x) => x.rig.kind === "agent");
  const outdated = agents.filter((x) => x.h.update === "outdated");
  const attention = rows.filter((x) => x.h.issues.length > 0);

  async function explain() {
    setBusy(true); setAiError(null);
    try {
      const r = await explainFn();
      if (r.ok) setAnswer(r.text); else setAiError(r.error);
    } catch {
      setAiError("The AI couldn't answer right now. Please try again later.");
    } finally { setBusy(false); }
  }

  async function updateAll() {
    try {
      await Promise.all(outdated.map((x) => sendRigCommand(x.rig.id, "update")));
      toast.success(`Update sent to ${outdated.length} rig(s)`);
      qc.invalidateQueries({ queryKey: rigsQuery.queryKey });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Newest rig program" value={`v${RIG_AGENT_VERSION}`} />
        <Stat label="Rig programs" value={agents.length} tone="plain" />
        <Stat label="Need update" value={outdated.length} tone={outdated.length ? "danger" : "plain"} />
        <Stat label="Need attention" value={attention.length} tone={attention.length ? "danger" : "plain"} />
      </div>

      <Section
        title="Which rigs need attention?"
        right={<Button size="sm" variant="glow" onClick={explain} disabled={busy || !rigs.length}><Sparkles /> {busy ? "Thinking…" : answer ? "Ask again" : "Explain with AI"}</Button>}
      >
        {aiError && <p className="rounded-lg border border-destructive/40 bg-inset p-3 text-sm text-destructive">{aiError}</p>}
        {answer ? (
          <div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            {answer.split("\n").filter((l) => l.trim()).map((l, i) => <p key={i}><Bold line={l} /></p>)}
          </div>
        ) : !aiError && (
          <p className="text-sm text-muted-foreground">AI-powered: reads your rigs' versions, status and temperatures and tells you what to fix first.</p>
        )}
      </Section>

      <Section
        title="Versions & updates"
        right={outdated.length > 1 ? <Button size="sm" variant="outline" onClick={updateAll}><Download /> Update all ({outdated.length})</Button> : null}
      >
        <ul className="space-y-2">
          {rows.map(({ rig, h }) => (
            <li key={rig.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to="/dashboard/rigs/$rigId" params={{ rigId: rig.id }} className="flex flex-wrap items-center gap-2 font-semibold">
                  {rig.name} <UpdateBadge rig={rig} />
                </Link>
                <UpdateButton rig={rig} size="sm" onSent={() => qc.invalidateQueries({ queryKey: rigsQuery.queryKey })} />
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {rig.kind === "agent" ? `Version ${rig.agent_version ? `v${rig.agent_version}` : "not reported yet"}` : "Browser rig · always current"}
                {" · "}{h.online ? "online" : h.lastSeenMinutesAgo != null ? `last seen ${h.lastSeenMinutesAgo} min ago` : "never connected"}
              </p>
              {h.issues.length > 0 && (
                <p className="mt-1 text-xs text-warning">{h.issues.join(" · ")}</p>
              )}
            </li>
          ))}
          {!rows.length && <li className="text-sm text-muted-foreground">No rigs yet.</li>}
        </ul>
      </Section>
    </div>
  );
}
