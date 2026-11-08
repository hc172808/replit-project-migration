// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RIG_AGENT_VERSION, rigUpdateStatus, isNewerVersion } from "@/lib/rig-agent-version";

describe("rig update rules", () => {
  it("offers the exact version served to rigs", () => {
    const code = readFileSync("public/rig-agent/agent.mjs", "utf8");
    expect(code.match(/const AGENT_VERSION = "([\d.]+)"/)?.[1]).toBe(RIG_AGENT_VERSION);
  });
  it("marks an older reported agent as needing an update", () => {
    expect(rigUpdateStatus({ kind: "agent", agent_version: "1.0.0" })).toBe("outdated");
    expect(rigUpdateStatus({ kind: "agent", agent_version: RIG_AGENT_VERSION })).toBe("current");
    expect(rigUpdateStatus({ kind: "agent", agent_version: "" })).toBe("unknown");
    expect(rigUpdateStatus({ kind: "browser", agent_version: "" })).toBe("not-applicable");
  });
  it("compares numeric version segments without downgrading", () => {
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.1.0", "2.0.0")).toBe(false);
  });
});