import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/miner/parts";
import { useBrowserRig } from "@/components/miner/browser-rig";
import { accountQuery } from "@/lib/miner-data";

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
  const { data } = useQuery(accountQuery);

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
    </Section>
  );
}
