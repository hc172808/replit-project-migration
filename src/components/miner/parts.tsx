import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Pencil, Plug, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EndpointRow } from "@/lib/miner-data";

export function fmtHash(h: number) {
  if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(2)} kH/s`;
  return `${Math.round(h)} H/s`;
}

export function fmtDuration(s: number) {
  s = Math.max(0, Math.floor(s));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = "signal" }: { label: string; value: ReactNode; tone?: "signal" | "plain" | "danger" }) {
  return (
    <div className="panel flex flex-col gap-1.5 p-4">
      <span className="eyebrow">{label}</span>
      <span
        className={cn(
          "font-mono text-xl font-bold tabular-nums",
          tone === "signal" && "text-signal",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function HashChart({ history }: { history: { ts: number; hr: number }[] | number[] }) {
  const pts = (history as ({ ts: number; hr: number } | number)[]).slice(-120).map((h) => (typeof h === "number" ? { ts: 0, hr: h } : h));
  const { path, area, max } = useMemo(() => {
    const W = 600, H = 140;
    const max = Math.max(1, ...pts.map((p) => p.hr));
    if (pts.length < 2) return { path: "", area: "", max };
    const step = W / 119;
    const offset = (120 - pts.length) * step;
    const coords = pts.map((p, i) => [offset + i * step, H - (p.hr / max) * (H - 10) - 4] as const);
    const path = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const first = coords[0]!, last = coords[coords.length - 1]!;
    const area = `${path} L${last[0].toFixed(1)},${H} L${first[0].toFixed(1)},${H} Z`;
    return { path, area, max };
  }, [pts]);

  return (
    <div className="rounded-lg bg-inset p-3">
      <svg viewBox="0 0 600 140" className="h-36 w-full" preserveAspectRatio="none" aria-label="Hash rate over the last 2 minutes">
        <defs>
          <linearGradient id="hrFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill="url(#hrFill)" />}
        {path && <path d={path} fill="none" stroke="var(--color-signal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>2 min ago</span>
        <span>peak {fmtHash(max)}</span>
        <span>now</span>
      </div>
    </div>
  );
}

type EpDraft = { label: string; url: string; cf_client_id: string; cf_client_secret: string };
const emptyDraft: EpDraft = { label: "", url: "", cf_client_id: "", cf_client_secret: "" };

export function EndpointList({
  endpoints, activeId, onAdd, onUpdate, onDelete, onMove, onTest,
}: {
  endpoints: EndpointRow[];
  activeId: string | null;
  onAdd: (d: EpDraft) => Promise<void>;
  onUpdate: (id: string, d: Partial<EpDraft>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (idx: number, dir: -1 | 1) => Promise<void>;
  onTest: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<EpDraft>(emptyDraft);
  const [adding, setAdding] = useState(false);

  function startEdit(e: EndpointRow) {
    setAdding(false);
    setEditing(e.id);
    setDraft({ label: e.label, url: e.url, cf_client_id: e.cf_client_id, cf_client_secret: "" });
  }

  async function submit() {
    if (!draft.url.trim()) { toast.error("URL is required."); return; }
    if (editing) {
      const patch: Partial<EpDraft> = { label: draft.label.trim() || "Node", url: draft.url.trim(), cf_client_id: draft.cf_client_id.trim() };
      if (draft.cf_client_secret) patch.cf_client_secret = draft.cf_client_secret;
      await onUpdate(editing, patch);
    } else {
      await onAdd({ ...draft, label: draft.label.trim() || "Node", url: draft.url.trim(), cf_client_id: draft.cf_client_id.trim() });
    }
    setEditing(null);
    setAdding(false);
    setDraft(emptyDraft);
  }

  const form = (
    <div className="space-y-3 rounded-lg bg-inset p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Label</Label><Input value={draft.label} placeholder="Primary" onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>RPC URL</Label><Input value={draft.url} placeholder="https://…" className="font-mono" onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>CF-Access-Client-Id</Label><Input value={draft.cf_client_id} className="font-mono" onChange={(e) => setDraft({ ...draft, cf_client_id: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>CF-Access-Client-Secret</Label>
          <Input type="password" value={draft.cf_client_secret} placeholder={editing ? "Leave blank to keep current" : ""} onChange={(e) => setDraft({ ...draft, cf_client_secret: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>{editing ? "Save endpoint" : "Add endpoint"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setAdding(false); setDraft(emptyDraft); }}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Tried in order. If one fails, the next one is used automatically.</p>
      <ul className="space-y-2">
        {endpoints.map((e, i) => (
          <li key={e.id} className="space-y-2">
            <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-3", activeId === e.id ? "border-primary" : "border-border")}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  {e.label}
                  {activeId === e.id && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">active</span>}
                  {e.has_cf_secret && <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has Cloudflare token" />}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{e.url}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => onMove(i, -1)}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === endpoints.length - 1} onClick={() => onMove(i, 1)}><ArrowDown /></Button>
                <Button size="icon" variant="ghost" aria-label="Test endpoint" onClick={() => onTest(e.id)}><Plug /></Button>
                <Button size="icon" variant="ghost" aria-label="Edit endpoint" onClick={() => startEdit(e)}><Pencil /></Button>
                <Button size="icon" variant="ghost" aria-label="Delete endpoint" onClick={() => { if (confirm(`Delete "${e.label}"?`)) void onDelete(e.id); }}><Trash2 /></Button>
              </div>
            </div>
            {editing === e.id && form}
          </li>
        ))}
      </ul>
      {adding && !editing ? form : !editing && (
        <Button size="sm" variant="outline" onClick={() => { setAdding(true); setDraft(emptyDraft); }}>+ Add endpoint</Button>
      )}
    </div>
  );
}

