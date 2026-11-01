import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { computeHash, meetsTarget, normaliseTarget } from "@/lib/mining/hash";
import { validateRpcUrl } from "@/lib/mining/url";
import { computeEffectiveThreads, reconnectDelay, MAX_RECONNECT_ATTEMPTS } from "@/lib/mining/engine";

describe("GYDS hash rule (same as original worker.js)", () => {
  it("hashes prevHash + address + decimal nonce with sha256", () => {
    const expected = createHash("sha256").update("abc0xWallet12345").digest("hex");
    expect(computeHash("abc", "0xWallet", "12345")).toBe(expected);
  });

  it("accepts a share only when hash < target, matching BigInt comparison", () => {
    const target = "00ffff";
    const t = normaliseTarget(target);
    const below = "0".repeat(59) + "0fffe";
    const above = "0".repeat(57) + "1000000";
    expect(meetsTarget(below, t)).toBe(BigInt("0x" + below) < BigInt("0x" + target));
    expect(meetsTarget(below, t)).toBe(true);
    expect(meetsTarget(above, t)).toBe(false);
    expect(meetsTarget(t, t)).toBe(false); // equal is not a share
  });
});

describe("thread count", () => {
  it("0 threads means all cores, times overclock", () => {
    expect(computeEffectiveThreads(0, 1, 8)).toBe(8);
    expect(computeEffectiveThreads(0, 2, 8)).toBe(16);
    expect(computeEffectiveThreads(3, 1, 8)).toBe(3);
  });
});

describe("reconnect back-off", () => {
  it("waits 5s, 15s, 30s, 60s, 120s, then 300s, and gives up after 20 attempts", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(reconnectDelay)).toEqual([5000, 15000, 30000, 60000, 120000, 300000, 300000]);
    expect(MAX_RECONNECT_ATTEMPTS).toBe(20);
  });
});

describe("RPC URL validation", () => {
  it("allows public http(s) nodes", () => {
    expect(() => validateRpcUrl("https://rpc.nelifegy.com")).not.toThrow();
  });
  it("rejects other protocols and private addresses", () => {
    expect(() => validateRpcUrl("ws://rpc.nelifegy.com")).toThrow(/not supported/);
    expect(() => validateRpcUrl("http://localhost:5000")).toThrow(/private or local/);
    expect(() => validateRpcUrl("http://192.168.1.10/rpc")).toThrow(/private or local/);
  });
});
