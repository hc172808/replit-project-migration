// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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
  it("records success only after a replaced agent starts and keeps it until acknowledged", () => {
    const source = readFileSync("public/rig-agent/agent.mjs", "utf8");
    const block = source.slice(source.indexOf("function loadUpdates()"), source.indexOf("// Main loop"));
    let stored = JSON.stringify({ events: [], pending: { targetVersion: "1.2.0" }, reportedVersion: "1.1.0" });
    const context = vm.createContext({ DIR: "/rig", AGENT_VERSION: "1.2.0", randomUUID: () => "event-1",
      path: { join: (...parts: string[]) => parts.join("/") },
      fs: { readFileSync: () => stored, writeFileSync: (_file: string, value: string) => { stored = value; }, renameSync: () => {} } });
    vm.runInContext(block, context);
    vm.runInContext("finishUpdateOnStartup()", context);
    const journal = JSON.parse(stored);
    expect(journal.events).toHaveLength(1);
    expect(journal.events[0]).toMatchObject({ installedVersion: "1.2.0", targetVersion: "1.2.0", result: "success" });
    expect(journal.pending).toBeNull();
    vm.runInContext("finishUpdateOnStartup()", context);
    expect(JSON.parse(stored).events).toHaveLength(1);
  });
  it("records a failed replacement with the version actually installed", () => {
    const source = readFileSync("public/rig-agent/agent.mjs", "utf8");
    const block = source.slice(source.indexOf("function loadUpdates()"), source.indexOf("// Main loop"));
    let stored = JSON.stringify({ events: [], pending: { targetVersion: "1.2.0" }, reportedVersion: "1.1.0" });
    const context = vm.createContext({ DIR: "/rig", AGENT_VERSION: "1.1.0", randomUUID: () => "event-2",
      path: { join: (...parts: string[]) => parts.join("/") },
      fs: { readFileSync: () => stored, writeFileSync: (_file: string, value: string) => { stored = value; }, renameSync: () => {} } });
    vm.runInContext(block, context);
    vm.runInContext("finishUpdateOnStartup()", context);
    expect(JSON.parse(stored).events[0]).toMatchObject({ installedVersion: "1.1.0", targetVersion: "1.2.0", result: "failed" });
  });
});