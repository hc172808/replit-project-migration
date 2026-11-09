import { describe, expect, it } from "vitest";
import { rigMonitoring } from "@/lib/rig-monitoring";

describe("fleet monitoring", () => {
  const now = Date.parse("2026-11-09T02:40:00Z");
  it("shows fresh check-ins online and stale check-ins offline", () => {
    expect(rigMonitoring("2026-11-09T02:39:55Z", 120, now).online).toBe(true);
    expect(rigMonitoring("2026-11-09T02:30:00Z", 120, now).online).toBe(false);
    expect(rigMonitoring(null, 0, now).online).toBe(false);
  });
  it("keeps the reported mining uptime without inventing offline mining time", () => {
    expect(rigMonitoring("2026-11-09T02:30:00Z", 3600, now).miningSeconds).toBe(3600);
    expect(rigMonitoring(null, undefined, now).miningSeconds).toBe(0);
    expect(rigMonitoring(null, -10, now).miningSeconds).toBe(0);
  });
});