// Shared (browser + server) rig health summary used by the Health page and the
// AI explainer. Pure functions only so tests can lock the rules.
import { isRigOnline } from "@/lib/assets";
import { RIG_AGENT_VERSION, rigUpdateStatus, type RigUpdateStatus } from "@/lib/rig-agent-version";

type RigLike = {
  name: string;
  kind: string;
  agent_version: string;
  status: string;
  desired_state: string;
  last_seen_at: string | null;
  profile_id: string | null;
  stats: {
    hashRate?: number;
    accepted?: number;
    rejected?: number;
    error?: string | null;
    devices?: { temp?: number }[];
  } | null;
};

export type RigHealth = {
  name: string;
  kind: "agent" | "browser" | string;
  version: string;
  latestVersion: string;
  update: RigUpdateStatus;
  online: boolean;
  lastSeenMinutesAgo: number | null;
  status: string;
  wantsToMine: boolean;
  hasProfile: boolean;
  hashRate: number;
  accepted: number;
  rejected: number;
  maxTempC: number | null;
  error: string | null;
  issues: string[];
};

export const HOT_TEMP_C = 85;

export function summariseRig(r: RigLike, now = Date.now()): RigHealth {
  const s = r.stats ?? {};
  const online = isRigOnline(r.last_seen_at, now);
  const temps = (s.devices ?? []).map((d) => d.temp ?? 0).filter((t) => t > 0);
  const maxTempC = temps.length ? Math.max(...temps) : null;
  const update = rigUpdateStatus(r);
  const wantsToMine = r.desired_state === "running";
  const accepted = Number(s.accepted ?? 0);
  const rejected = Number(s.rejected ?? 0);
  const issues: string[] = [];
  if (r.kind === "agent" && !r.last_seen_at) issues.push("never connected");
  else if (r.kind === "agent" && !online) issues.push("offline");
  if (update === "outdated") issues.push("update available");
  if (wantsToMine && online && r.status !== "mining") issues.push(`should be mining but is ${r.status}`);
  if (!r.profile_id) issues.push("no mining profile");
  if (s.error) issues.push("reported an error");
  if (maxTempC != null && maxTempC >= HOT_TEMP_C) issues.push(`running hot (${maxTempC}°C)`);
  if (rejected > 0 && rejected >= accepted && rejected >= 5) issues.push("more rejected than accepted shares");
  return {
    name: r.name,
    kind: r.kind,
    version: r.kind === "agent" ? r.agent_version || "unknown" : "browser",
    latestVersion: RIG_AGENT_VERSION,
    update,
    online,
    lastSeenMinutesAgo: r.last_seen_at ? Math.round((now - new Date(r.last_seen_at).getTime()) / 60000) : null,
    status: r.status,
    wantsToMine,
    hasProfile: !!r.profile_id,
    hashRate: Number(s.hashRate ?? 0),
    accepted,
    rejected,
    maxTempC,
    error: s.error ? String(s.error).slice(0, 200) : null,
    issues,
  };
}
