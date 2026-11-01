// Rig enrolment: creates a rig and returns its access token exactly once.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { newRigToken, sha256Hex } from "@/lib/rig-token";

export const createAgentRig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().min(1).max(60), profileId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = newRigToken();
    const { data: rig, error } = await context.supabase
      .from("rigs")
      .insert({
        user_id: context.userId,
        name: data.name.trim(),
        kind: "agent",
        token_hash: await sha256Hex(token),
        profile_id: data.profileId,
        tuning: { cpuThreads: 0, cpuOverclock: 1, cpuIntensity: 100 },
      })
      .select("id")
      .single();
    if (error) {
      console.error("createAgentRig", error);
      throw new Error("Could not add the rig.");
    }
    return { id: rig.id, token };
  });

export const rotateRigToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const token = newRigToken();
    const { data: rows, error } = await context.supabase
      .from("rigs")
      .update({ token_hash: await sha256Hex(token) })
      .eq("id", data.id)
      .eq("kind", "agent")
      .select("id");
    if (error || !rows?.length) throw new Error("Rig not found.");
    return { token };
  });
