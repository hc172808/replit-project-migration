import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/miner/parts";
import { Switch } from "@/components/ui/switch";
import { useBrowserRig } from "@/components/miner/browser-rig";
import { accountQuery } from "@/lib/miner-data";
import { IDLE_SESSION_TIMEOUT_MS, saveIdleLockEnabled, subscribeIdleLockPreference } from "@/lib/idle-session";

export const Route = createFileRoute("/_authenticated/dashboard/account")({
  head: () => ({
    meta: [
      { title: "Account — GYDS Miner" },
      { name: "description", content: "Your GYDS Miner account: username, wallet and sign out." },
      { property: "og:title", content: "Account — GYDS Miner" },
      { property: "og:description", content: "Your GYDS Miner account: username, wallet and sign out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

function Account() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const browser = useBrowserRig();
  const { user } = Route.useRouteContext();
  const { data } = useQuery(accountQuery);
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [autoLockError, setAutoLockError] = useState<string | null>(null);

  useEffect(
    () => subscribeIdleLockPreference(user.id, setAutoLockEnabled),
    [user.id],
  );

  function changeAutoLock(enabled: boolean) {
    setAutoLockError(null);
    try {
      saveIdleLockEnabled(user.id, enabled);
      setAutoLockEnabled(enabled);
    } catch {
      setAutoLockError("Could not save this browser's automatic lock setting.");
    }
  }

  async function signOut() {
    if (browser.state.running) await browser.run("stop");
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Section title="Account">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Username</dt><dd className="font-mono">{data?.username ?? "—"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Wallet</dt><dd className="break-all font-mono">{data?.wallet_address ?? "—"}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild variant="secondary"><Link to="/install"><Smartphone /> Install on your phone</Link></Button>
        <Button variant="outline" onClick={signOut}><LogOut /> Sign out</Button>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="space-y-1">
          <Label htmlFor="auto-lock">Automatic dashboard lock</Label>
          <p className="text-xs text-muted-foreground">
            {autoLockEnabled
              ? `Sign out after ${IDLE_SESSION_TIMEOUT_MS / 60_000} minutes without activity.`
              : "Off. Anyone with access to this browser can use your signed-in dashboard."}
          </p>
          <p className="text-xs text-muted-foreground">This setting applies to this browser.</p>
        </div>
        <Switch
          id="auto-lock"
          aria-label="Automatic dashboard lock"
          checked={autoLockEnabled}
          onCheckedChange={changeAutoLock}
        />
      </div>
      {autoLockError && <p className="mt-2 text-sm text-destructive" role="alert">{autoLockError}</p>}
    </Section>
  );
}
