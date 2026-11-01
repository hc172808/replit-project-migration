import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { clampTuning, isRigOnline, TUNING_LIMITS, type Tuning } from "@/lib/assets";
import type { MiningProfile, Rig } from "@/lib/miner-data";
import { createAgentRig } from "@/lib/rigs.functions";

export type RigView = { online: boolean; label: string; tone: "on" | "off" | "warn" | "danger" };

export function rigView(rig: Rig, isThisBrowser: boolean, localRunning?: boolean): RigView {
  const online = isThisBrowser || isRigOnline(rig.last_seen_at);
  if (!online) return { online, label: "Offline", tone: "off" };
  const status = isThisBrowser ? (localRunning ? "mining" : rig.status === "error" ? "error" : "idle") : rig.status;
  if (status === "mining") return { online, label: "Mining", tone: "on" };
  if (status === "starting") return { online, label: "Starting…", tone: "warn" };
  if (status === "error") return { online, label: "Error", tone: "danger" };
  return { online, label: "Idle", tone: "off" };
}

export function StatusPill({ view }: { view: RigView }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        view.tone === "on" && "bg-accent text-signal",
        view.tone === "off" && "bg-muted text-muted-foreground",
        view.tone === "warn" && "bg-muted text-warning",
        view.tone === "danger" && "bg-muted text-destructive",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", view.tone === "on" && "animate-pulse-dot")} />
      {view.label}
    </span>
  );
}

const CPU_FIELDS: { k: keyof Tuning; label: string; hint: string }[] = [
  { k: "cpuThreads", label: "CPU threads (0 = auto)", hint: "Auto uses every core it finds." },
  { k: "cpuOverclock", label: "CPU boost (thread multiplier)", hint: "Threads × this value, 0.5–4. Too high can slow hashing." },
  { k: "cpuIntensity", label: "CPU usage limit (%)", hint: "10–100. Rig program only." },
  { k: "batchSize", label: "Batch size (GYDS)", hint: "Hashes per tick, default 20000." },
  { k: "batchDelayMs", label: "Throttle delay ms (GYDS)", hint: "Pause between batches, 0 = full speed." },
];
const GPU_FIELDS: { k: keyof Tuning; label: string; hint: string }[] = [
  { k: "gpuIntensity", label: "GPU intensity", hint: "1–30, passed to the mining program." },
  { k: "gpuPowerLimit", label: "GPU power limit (%)", hint: "50–120 % of stock." },
  { k: "gpuCoreOffset", label: "GPU core clock offset (MHz)", hint: "−500 to +300." },
  { k: "gpuMemOffset", label: "GPU memory clock offset (MHz)", hint: "−1000 to +2000." },
  { k: "gpuFan", label: "GPU fan (%)", hint: "0 = automatic." },
];

export function TuningForm({ tuning, showGpu, onSave }: { tuning: Tuning; showGpu: boolean; onSave: (t: Tuning) => Promise<void> }) {
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(TUNING_LIMITS).map((k) => [k, tuning[k as keyof Tuning]?.toString() ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const field = ({ k, label, hint }: { k: keyof Tuning; label: string; hint: string }) => (
    <div key={k} className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} inputMode="decimal" className="font-mono" value={f[k] ?? ""} placeholder="default" onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try { await onSave(clampTuning(f)); } finally { setBusy(false); }
      }}
    >
      <div>
        <p className="eyebrow mb-3">CPU</p>
        <div className="grid gap-3 sm:grid-cols-2">{CPU_FIELDS.map(field)}</div>
      </div>
      {showGpu && (
        <div>
          <p className="eyebrow mb-3">GPU overclock</p>
          <div className="grid gap-3 sm:grid-cols-2">{GPU_FIELDS.map(field)}</div>
          <p className="mt-2 text-xs text-warning">
            GPU clock and power changes only apply when the rig's owner sets ALLOW_GPU_OC=true in its .env file.
          </p>
        </div>
      )}
      <Button type="submit" disabled={busy}>Save &amp; apply</Button>
    </form>
  );
}

export function envFileFor(origin: string, token: string, name: string) {
  return [
    `# GYDS rig program settings — keep this file private`,
    `DASHBOARD_URL=${origin}`,
    `RIG_TOKEN=${token}`,
    `RIG_NAME=${name}`,
    ``,
    `# Paths to mining programs you've installed (only the ones you use)`,
    `XMRIG_PATH=xmrig`,
    `TREX_PATH=t-rex`,
    `LOLMINER_PATH=lolMiner`,
    `SRBMINER_PATH=SRBMiner-MULTI`,
    `CGMINER_PATH=cgminer`,
    ``,
    `# Allow the dashboard to change GPU clocks, power and fans on this machine`,
    `ALLOW_GPU_OC=false`,
  ].join("\n");
}

function CopyBlock({ text }: { text: string }) {
  return (
    <div className="relative">
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-inset p-3 pr-10 font-mono text-[11px]">{text}</pre>
      <Button
        size="icon" variant="ghost" className="absolute right-1 top-1" aria-label="Copy"
        onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}
      >
        <Copy />
      </Button>
    </div>
  );
}

export function SetupInstructions({ token, name }: { token: string; name: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isPreview = origin.includes("id-preview--") || origin.includes("localhost");
  return (
    <div className="space-y-4 text-sm">
      {isPreview && (
        <p className="rounded-lg border border-warning/40 bg-inset p-3 text-xs text-warning">
          You're on the private preview address. Publish the app and use its public address below instead, or rigs won't be able to reach the dashboard.
        </p>
      )}
      <div className="space-y-2">
        <p className="font-semibold">Linux, macOS or Android (Termux)</p>
        <CopyBlock text={`curl -fsSL ${origin}/rig-agent/install.sh | DASHBOARD_URL=${origin} RIG_TOKEN=${token} RIG_NAME="${name}" bash`} />
      </div>
      <div className="space-y-2">
        <p className="font-semibold">Windows (PowerShell)</p>
        <CopyBlock text={`$env:DASHBOARD_URL="${origin}"; $env:RIG_TOKEN="${token}"; $env:RIG_NAME="${name}"; iwr -useb ${origin}/rig-agent/install.ps1 | iex`} />
      </div>
      <div className="space-y-2">
        <p className="font-semibold">Or create the .env file yourself</p>
        <CopyBlock text={envFileFor(origin, token, name)} />
      </div>
      <p className="text-xs text-muted-foreground">
        The token is shown only once. The rig program finds this machine's CPUs and GPUs and reports them to the dashboard. It needs Node.js 18 or newer.
      </p>
    </div>
  );
}

export function AddRigDialog({ open, onOpenChange, profiles, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; profiles: MiningProfile[]; onCreated: () => void;
}) {
  const createFn = useServerFn(createAgentRig);
  const [name, setName] = useState("");
  const [profileId, setProfileId] = useState<string>("");
  const [result, setResult] = useState<{ token: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setName(""); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? `Set up ${result.name}` : "Add a rig"}</DialogTitle>
          <DialogDescription>
            {result ? "Run one of these on the machine." : "A server, PC or phone that runs the rig program."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <SetupInstructions token={result.token} name={result.name} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setBusy(true);
              try {
                const r = await createFn({ data: { name: name.trim(), profileId: profileId || null } });
                setResult({ token: r.token, name: name.trim() });
                onCreated();
              } catch (err) {
                toast.error((err as Error).message);
              } finally { setBusy(false); }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="rigname">Rig name</Label>
              <Input id="rigname" value={name} placeholder="ubuntu-rig-1" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rigprofile">Mining profile</Label>
              <select
                id="rigprofile"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                <option value="">Choose later</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.coin})</option>)}
              </select>
            </div>
            <Button type="submit" variant="glow" disabled={busy || !name.trim()}>Create rig</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
