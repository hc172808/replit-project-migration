import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error(result.error.message ?? "Sign-in failed");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <div className="flex flex-col items-center text-center">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-2xl font-bold">GYDS Miner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" && "Sign in to your mining dashboard."}
          {mode === "signup" && "Create an account for your rig."}
          {mode === "forgot" && "We'll email you a reset link."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="panel mt-8 space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "forgot" && (
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
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </Button>

        {mode !== "forgot" && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => oauth("google")}>
              Continue with Google
            </Button>
            <button type="button" className="lovable-auth-button w-full" onClick={() => oauth("lovable")}>
              Continue with Lovable
            </button>
          </>
        )}
      </form>

      <div className="mt-5 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        {mode === "signin" && (
          <>
            <button className="hover:text-foreground" onClick={() => setMode("forgot")}>Forgot password?</button>
            <button className="hover:text-foreground" onClick={() => setMode("signup")}>No account? Create one</button>
          </>
        )}
        {mode !== "signin" && (
          <button className="hover:text-foreground" onClick={() => setMode("signin")}>Back to sign in</button>
        )}
        <Link to="/" className="hover:text-foreground">← Home</Link>
      </div>
    </main>
  );
}
