import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerUsername, getWalletChallenge, signInWithWallet } from "@/lib/account.functions";
import { normaliseUsername, USERNAME_RE, usernameEmail } from "@/lib/assets";
import { connectWallet, type WalletKind } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — GYDS Miner" },
      { name: "description", content: "Sign in or create an account to use the GYDS Miner dashboard." },
      { property: "og:title", content: "Sign in — GYDS Miner" },
      { property: "og:description", content: "Sign in or create an account to use the GYDS Miner dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const register = useServerFn(registerUsername);
  const challenge = useServerFn(getWalletChallenge);
  const walletSignIn = useServerFn(signInWithWallet);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const name = normaliseUsername(username);
      if (!USERNAME_RE.test(name)) throw new Error("Use 3–24 letters, numbers or underscores for your username.");
      if (mode === "signup") {
        const result = await register({ data: { username: name, password } });
        if (!result.ok) throw new Error(result.error);
      }
      const { error } = await supabase.auth.signInWithPassword({ email: usernameEmail(name), password });
      if (error) throw error;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function wallet(kind: WalletKind) {
    setBusy(true);
    setNotice(null);
    let connection: Awaited<ReturnType<typeof connectWallet>> | undefined;
    try {
      connection = await connectWallet(kind);
      const { message } = await challenge({ data: { address: connection.address } });
      const signature = await connection.sign(message);
      const result = await walletSignIn({ data: { address: connection.address, message, signature } });
      if (!result.ok) throw new Error(result.error);
      const { error } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: "magiclink" });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet sign-in failed.");
    } finally {
      await connection?.disconnect().catch(() => {});
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <div className="flex flex-col items-center text-center">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-2xl font-bold">GYDS Miner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" && "Sign in to your mining dashboard."}
          {mode === "signup" && "Create an account for your rig."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="panel mt-8 space-y-4 p-5">
        <div className="space-y-1.5">
           <Label htmlFor="username">Username</Label>
           <Input id="username" autoComplete="username" required minLength={3} maxLength={24} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        {(
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {notice && <p className="text-sm text-success">{notice}</p>}
        <Button type="submit" variant="glow" className="w-full" disabled={busy}>
          {busy ? "Connecting…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>

        {(
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => wallet("injected")}>
              Browser wallet
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => wallet("walletconnect")}>
              WalletConnect
            </Button>
          </>
        )}
      </form>

      <div className="mt-5 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        {mode === "signin" && (
          <>
            <Button variant="link" onClick={() => setMode("signup")}>No account? Create one</Button>
          </>
        )}
        {mode !== "signin" && (
          <Button variant="link" onClick={() => setMode("signin")}>Back to sign in</Button>
        )}
        {mode === "signup" && <p className="text-center text-xs">No recovery email. Keep your username and password safe.</p>}
        <Link to="/" className="hover:text-foreground">← Home</Link>
      </div>
    </main>
  );
}
