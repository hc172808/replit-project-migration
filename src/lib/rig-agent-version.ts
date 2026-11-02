// The newest rig program version this dashboard serves at /rig-agent/agent.mjs.
// Bump this together with AGENT_VERSION inside public/rig-agent/agent.mjs whenever
// the rig program changes; rigs running an older version show "Update available".
// src/test/rig-agent.test.ts fails if the two drift apart.
export const RIG_AGENT_VERSION = "1.1.0";

/** True when `latest` is a higher dotted version than `current` (e.g. 1.2.0 > 1.1.9). */
export function isNewerVersion(latest: string, current: string): boolean {
  if (!current) return false; // rig hasn't reported yet
  const a = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
