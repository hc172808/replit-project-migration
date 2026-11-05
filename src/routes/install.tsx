import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Install on your phone — GYDS Miner" },
      { name: "description", content: "Add the GYDS Miner dashboard to your phone or PC home screen and open it like an app." },
      { property: "og:title", content: "Install GYDS Miner on your phone" },
      { property: "og:description", content: "Add the mining dashboard to your iPhone, Android or PC home screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstallPage,
});

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function InstallPage() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 py-10">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <h1 className="text-2xl font-bold">Install GYDS Miner</h1>
          <p className="text-sm text-muted-foreground">Put the dashboard on your home screen and open it like an app.</p>
        </div>
      </div>

      {installed ? (
        <p className="panel p-4 text-sm text-signal">You're already using the installed app.</p>
      ) : prompt ? (
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Your browser can install it in one tap.</p>
          <Button variant="glow" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>
            <Download /> Install app
          </Button>
        </div>
      ) : null}

      <section className="panel space-y-2 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 text-signal" /> iPhone or iPad (Safari)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open this site in <strong className="text-foreground">Safari</strong>.</li>
          <li>Tap the <strong className="text-foreground">Share</strong> button (square with an arrow).</li>
          <li>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong>, then <strong className="text-foreground">Add</strong>.</li>
        </ol>
      </section>

      <section className="panel space-y-2 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 text-signal" /> Android (Chrome)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open this site in <strong className="text-foreground">Chrome</strong>.</li>
          <li>Tap the <strong className="text-foreground">⋮</strong> menu at the top right.</li>
          <li>Tap <strong className="text-foreground">Install app</strong> (or <strong className="text-foreground">Add to Home screen</strong>) and confirm.</li>
        </ol>
      </section>

      <section className="panel space-y-2 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Monitor className="h-4 w-4 text-signal" /> PC or Mac (Chrome or Edge)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Click the <strong className="text-foreground">install</strong> icon at the right end of the address bar.</li>
          <li>Or open the browser menu and choose <strong className="text-foreground">Install GYDS Miner</strong>.</li>
        </ol>
      </section>

      <p className="text-xs text-muted-foreground">
        The installed app needs an internet connection. Browser mining in the app only runs while it's open on screen; for mining that keeps going, add the device as a rig with the rig program.
      </p>

      <div className="flex gap-3 text-sm">
        <Link to="/dashboard" className="text-signal hover:underline">Open dashboard</Link>
        <Link to="/" className="text-muted-foreground hover:text-foreground">← Home</Link>
      </div>
    </main>
  );
}
