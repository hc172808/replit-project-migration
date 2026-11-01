// Rig program check-in. Authenticated by the rig's own token (Bearer).
// The rig reports hardware/stats/log and command results; the response
// carries its desired state, tuning, mining profile and pending commands.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sha256Hex } from "@/lib/rig-token";
import { clampTuning } from "@/lib/assets";

const Body = z.object({
  hostname: z.string().max(200).default(""),
  platform: z.string().max(200).default(""),
  agentVersion: z.string().max(50).default(""),
  status: z.enum(["mining", "idle", "error", "starting"]).default("idle"),
  hardware: z.record(z.string(), z.unknown()).default({}),
  stats: z.record(z.string(), z.unknown()).default({}),
  log: z.array(z.string().max(500)).max(100).default([]),
  commandResults: z
    .array(z.object({ id: z.string().uuid(), ok: z.boolean(), message: z.string().max(500).default("") }))
    .max(50)
    .default([]),
});

export const Route = createFileRoute("/api/public/rig/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!/^rig_[0-9a-f]{64}$/.test(token)) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }
        if (JSON.stringify(body).length > 64_000) return Response.json({ error: "Body too large" }, { status: 413 });

        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(token);
        const { data: rig } = await sb
          .from("rigs")
          .select("id, user_id, name, desired_state, tuning, profile_id, log, kind")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!rig || rig.kind !== "agent") return new Response("Unauthorized", { status: 401 });

        // Record results for commands this rig was given.
        for (const r of body.commandResults) {
          await sb
            .from("rig_commands")
            .update({ status: r.ok ? "done" : "failed", result: r.message, updated_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("rig_id", rig.id);
        }

        const log = [...(rig.log ?? []), ...body.log].slice(-200);
        await sb
          .from("rigs")
          .update({
            hostname: body.hostname,
            platform: body.platform,
            agent_version: body.agentVersion,
            status: body.status,
            hardware: body.hardware as never,
            stats: body.stats as never,
            log,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", rig.id);

        const { data: commands } = await sb
          .from("rig_commands")
          .select("id, command, payload")
          .eq("rig_id", rig.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(20);
        if (commands?.length) {
          await sb
            .from("rig_commands")
            .update({ status: "acked", updated_at: new Date().toISOString() })
            .in("id", commands.map((c) => c.id));
        }

        let profile = null;
        if (rig.profile_id) {
          const { data: p } = await sb.from("mining_profiles").select("*").eq("id", rig.profile_id).maybeSingle();
          if (p) {
            const { data: eps } = await sb
              .from("rpc_endpoints")
              .select("label, url, cf_client_id, cf_client_secret")
              .eq("profile_id", p.id)
              .order("position", { ascending: true });
            profile = {
              id: p.id, name: p.name, coin: p.coin, algorithm: p.algorithm, miner: p.miner, device: p.device,
              poolUrl: p.pool_url, wallet: p.wallet_address, worker: p.worker_name || rig.name,
              password: p.pool_password, mode: p.mining_mode, extraArgs: p.extra_args,
              endpoints: (eps ?? []).map((e) => ({ label: e.label, url: e.url, cfClientId: e.cf_client_id, cfClientSecret: e.cf_client_secret })),
              updatedAt: p.updated_at,
            };
          }
        }

        return Response.json(
          {
            rig: { id: rig.id, name: rig.name, desiredState: rig.desired_state, tuning: clampTuning((rig.tuning ?? {}) as Record<string, unknown>) },
            profile,
            commands: commands ?? [],
            pollSeconds: 10,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
