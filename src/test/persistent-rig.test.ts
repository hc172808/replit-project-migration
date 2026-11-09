// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const source = readFileSync("public/rig-agent/agent.mjs", "utf8");
describe("persistent installed rig", () => {
  it("initializes settings before starting the installed program", () => {
    const result = spawnSync(process.execPath, ["public/rig-agent/agent.mjs"], {
      env: { ...process.env, DASHBOARD_URL: "", RIG_TOKEN: "" }, encoding: "utf8", timeout: 5000,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("DASHBOARD_URL and RIG_TOKEN must be set");
    expect(result.stderr).not.toContain("ReferenceError");
  });
  it("saves and restores running state and stops only on an explicit stopped state", () => {
    let saved = "";
    const start = vi.fn().mockResolvedValue(undefined), stop = vi.fn();
    class Miner { start = start; stop = stop; }
    const controller = source.slice(source.indexOf("let hardware = null;"), source.indexOf("async function selfUpdate"));
    const context = vm.createContext({ fs: { readFileSync: () => saved, writeFileSync: (_path: string, data: string) => { saved = data; } },
      STATE_FILE: "state.json", log: vi.fn(), BuiltinMiner: Miner, ExternalMiner: Miner });
    vm.runInContext(controller, context);
    const running = { desiredState: "running", profile: { id: "p1", coin: "GYDS", miner: "builtin" }, tuning: {} };
    context['state'] = running;
    vm.runInContext("saveState(state); reconcile(loadState()); reconcile(loadState());", context);
    expect(JSON.parse(saved)).toEqual(running);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    vm.runInContext("reconcile({ ...loadState(), desiredState: 'stopped' });", context);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("refuses a mismatched update before replacing the agent", async () => {
    const write = vi.fn();
    const block = source.slice(source.indexOf("async function selfUpdate"), source.indexOf("// Main loop"));
    const context = vm.createContext({ CFG: { dashboard: "https://miner.example" }, AGENT_VERSION: "1.0.0", SELF: "agent.mjs",
      AbortSignal, fs: { writeFileSync: write, renameSync: vi.fn() }, log: vi.fn(),
      fetch: async () => ({ ok: true, text: async () => 'const AGENT_VERSION = "1.0.1";' }) });
    vm.runInContext(block, context);
    await expect(vm.runInContext('selfUpdate("1.1.0")', context)).rejects.toThrow(/downloaded v1.0.1/);
    expect(write).not.toHaveBeenCalled();
  });
});