// AI explanation of which rigs need attention. Reads only the caller's rigs (RLS).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summariseRig } from "@/lib/rig-health";

const INSTRUCTIONS = `You help a crypto-mining hobbyist look after their mining rigs.
You get a JSON list of rigs with their reported program version, the newest version, online state, mining state, temperatures, shares and detected issues.
Write a short plain-English answer for a non-technical owner:
- Start with one sentence: how many rigs need attention.
- Then a bullet per rig that needs attention: **rig name** — what's wrong, why it matters, and the one thing to do (e.g. "press Update", "check the machine is on and online", "pick a mining profile", "improve cooling").
- Rigs with update "outdated" should be updated with the Update button; mention the version they're on and the newest one.
- End with one line listing rigs that look fine, if any.
Keep it under 180 words. Don't invent data that isn't in the list. No headings.`;

export const explainRigHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rigs, error } = await context.supabase
      .from("rigs")
      .select("name, kind, agent_version, status, desired_state, last_seen_at, profile_id, stats")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) {
      console.error("explainRigHealth rigs", error);
      return { ok: false as const, error: "Could not load your rigs." };
    }
    if (!rigs?.length) return { ok: true as const, text: "You don't have any rigs yet. Add one from the Rigs page." };

    const summary = rigs.map((r) => summariseRig(r as never));
    const { generateTextStreamed, GatewayError } = await import("@/lib/ai-gateway.server");
    try {
      const text = await generateTextStreamed({
        instructions: INSTRUCTIONS,
        prompt: JSON.stringify(summary),
        signal: getRequest()?.signal,
      });
      return { ok: true as const, text };
    } catch (e) {
      return { ok: false as const, error: e instanceof GatewayError ? e.message : "The AI couldn't answer right now." };
    }
  });
