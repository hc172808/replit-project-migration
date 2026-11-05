import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_BUILD_ID, hasNewAppVersion } from "@/lib/app-version";

const CHECK_EVERY_MS = 2 * 60 * 1000;

/** Shows a banner when a newer version of the dashboard has been published. */
export function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/public/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (hasNewAppVersion(APP_BUILD_ID, build)) setAvailable(true);
      } catch {
        /* offline — try again later */
      }
    }
    check();
    const t = setInterval(check, CHECK_EVERY_MS);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!available) return null;
  return (
    <div role="status" className="panel mb-4 flex flex-wrap items-center justify-between gap-3 border-primary/40 p-3 text-sm">
      <span>
        <strong className="text-signal">Update available.</strong> A new version of the dashboard has been published.
      </span>
      <Button size="sm" variant="glow" onClick={() => window.location.reload()}>
        <RefreshCw /> Reload now
      </Button>
    </div>
  );
}
