import { isRigOnline } from "@/lib/assets";

export function rigMonitoring(lastSeen: string | null, uptime: number | undefined, now = Date.now()) {
  return { online: isRigOnline(lastSeen, now), miningSeconds: Number.isFinite(uptime) ? Math.max(0, uptime ?? 0) : 0,
    lastCheckIn: lastSeen ? new Date(lastSeen).toLocaleString() : "Never connected" };
}