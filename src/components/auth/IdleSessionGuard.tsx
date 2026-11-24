import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useBrowserRig } from "@/components/miner/browser-rig";
import { supabase } from "@/integrations/supabase/client";
import { IDLE_SESSION_TIMEOUT_MS, watchIdleSession } from "@/lib/idle-session";

type IdleSessionGuardProps = {
  userId: string;
  children: ReactNode;
};

export function IdleSessionGuard({ userId, children }: IdleSessionGuardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state: browserRigState, run: runBrowserRig } = useBrowserRig();
  const [locked, setLocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const locking = useRef(false);

  const lockSession = useCallback(async () => {
    if (locking.current) return;
    locking.current = true;
    setLocked(true);
    setLockError(null);

    try {
      // Stop in-tab mining before ending the session. Keep the dashboard hidden
      // immediately; if the network is slow, still finish locking after 5 sec.
      if (browserRigState.running) {
        let timeout: number | undefined;
        try {
          const stopped = await Promise.race([
            runBrowserRig("stop").then((result) => ({ kind: "stopped" as const, result })),
            new Promise<{ kind: "timeout" }>((resolve) => {
              timeout = window.setTimeout(() => resolve({ kind: "timeout" }), 5000);
            }),
          ]);
          if (stopped.kind === "timeout" || !stopped.result.ok) {
            console.warn("Browser mining could not be confirmed stopped before the idle sign-out.");
          }
        } finally {
          if (timeout !== undefined) window.clearTimeout(timeout);
        }
      }

      queryClient.clear();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      await navigate({ to: "/auth", replace: true });
    } catch {
      locking.current = false;
      setLockError("Your dashboard is hidden, but sign-out could not be confirmed. Retry to secure the session.");
    }
  }, [browserRigState.running, navigate, queryClient, runBrowserRig]);

  const lockSessionRef = useRef(lockSession);
  useEffect(() => {
    lockSessionRef.current = lockSession;
  }, [lockSession]);

  useEffect(
    () =>
      watchIdleSession({
        userId,
        onIdle: () => void lockSessionRef.current(),
      }),
    [userId],
  );

  if (locked) {
    return (
      <main
        className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-background px-5"
        role="alert"
        aria-live="assertive"
      >
        <section className="panel w-full max-w-sm space-y-3 p-6 text-center">
          <h1 className="text-xl font-semibold">Dashboard locked</h1>
          <p className="text-sm text-muted-foreground">
            You were signed out after {IDLE_SESSION_TIMEOUT_MS / 60_000} minutes of inactivity.
            Sign in again to continue.
          </p>
          {lockError && (
            <>
              <p className="text-sm text-destructive" role="alert">{lockError}</p>
              <Button onClick={() => void lockSession()}>Retry sign out</Button>
            </>
          )}
        </section>
      </main>
    );
  }

  return children;
}
