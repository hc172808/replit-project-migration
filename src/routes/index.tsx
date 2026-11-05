import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cpu, ShieldCheck, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GYDS Miner — mine GYDS from your browser" },
      { name: "description", content: "Start and stop GYDS mining from any browser and watch hash rate, shares and rewards live." },
      { property: "og:title", content: "GYDS Miner — mine GYDS from your browser" },
      { property: "og:description", content: "Start and stop GYDS mining from any browser and watch hash rate, shares and rewards live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
      <div className="flex items-center gap-3">
        <BrandMark size="lg" />
        <div>
          <p className="eyebrow">GYDS network</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">GYDS Miner</h1>
        </div>
      </div>

      <p className="mt-8 max-w-xl text-lg text-muted-foreground">
        Mine GYDS right from this browser tab. Set your wallet, press start, and watch your hash rate,
        shares and rewards live.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {signedIn ? (
          <Button asChild variant="glow" size="lg">
            <Link to="/dashboard">Open dashboard</Link>
          </Button>
        ) : (
          <Button asChild variant="glow" size="lg">
            <Link to="/auth">Sign in to start</Link>
          </Button>
        )}
        <Button asChild variant="outline" size="lg">
          <Link to="/install">Install on your phone</Link>
        </Button>
      </div>

      <ul className="mt-14 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Cpu, t: "Uses your device", d: "Mining runs only while this tab is open and you've pressed Start." },
          { icon: Activity, t: "Live stats", d: "Hash rate chart, shares, rewards and lifetime totals." },
          { icon: ShieldCheck, t: "Your account", d: "Wallet, nodes and access tokens are saved to your account only." },
        ].map(({ icon: Icon, t, d }) => (
          <li key={t} className="panel p-4">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">{t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
