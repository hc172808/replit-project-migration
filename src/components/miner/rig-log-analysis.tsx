import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/miner/parts";
import { explainRigLogs } from "@/lib/rig-health.functions";

export function RigLogAnalysis({ rigId, reportedLog }: { rigId: string; reportedLog: string[] }) {
  const analyze = useServerFn(explainRigLogs);
  const [logs, setLogs] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Section title="Troubleshoot errors">
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(""); setAnswer("");
      try {
        const result = await analyze({ data: { rigId, logs } });
        if (result.ok) setAnswer(result.text); else setError(result.error);
      } catch { setError("Could not submit these logs. Please try again."); }
      finally { setBusy(false); }
    }}>
      <Label htmlFor="error-logs">Error logs</Label>
      <Textarea id="error-logs" value={logs} onChange={(e) => setLogs(e.target.value)} required maxLength={16000} rows={7} placeholder="Paste the errors from this rig…" className="font-mono text-xs" disabled={busy} />
      <p className="text-xs text-muted-foreground">Remove passwords, tokens and private keys before submitting. Submitted logs are sent to Lovable AI for analysis.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !reportedLog.length} onClick={() => setLogs(reportedLog.slice(-100).join("\n").slice(0, 16000))}><FileText /> Use reported logs</Button>
        <Button type="submit" variant="glow" disabled={busy || !logs.trim()}><Sparkles /> {busy ? "Analyzing…" : "Analyze logs"}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {answer && <div aria-live="polite" className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{answer}</div>}
    </form>
  </Section>;
}