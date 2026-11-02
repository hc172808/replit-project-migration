#!/usr/bin/env node
// GYDS rig program — runs on a server, PC or phone (Termux) and is controlled
// from the GYDS Miner dashboard. No npm packages needed: Node.js 18+ only.
//
// What it does
//   • finds this machine's CPUs and GPUs (NVIDIA, AMD, Intel, Apple) and reports them
//   • checks in with the dashboard every ~10 s and follows its start / stop /
//     restart / tuning / profile / update commands
//   • keeps mining until you press Stop on the dashboard — it survives dashboard
//     outages (uses the last known settings) and, when installed as a service,
//     reboots and crashes too
//   • mines GYDS with its built-in miner, or runs XMRig / T-Rex / lolMiner /
//     SRBMiner-MULTI / CGMiner for other coins
//   • tells the dashboard its version so it can show "Update available"
//
// Settings come from the .env file next to this script (see .env.example).

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const AGENT_VERSION = "1.1.0";
const SELF = fileURLToPath(import.meta.url);
const DIR = path.dirname(SELF);

if (!isMainThread) runHashThread();
else main().catch((e) => { console.error("Fatal:", e); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
// Built-in GYDS hashing thread. Same rule as the browser miner and the original
// worker.js: sha256(prevHash + address + decimalNonce); share when hash < target.
// ─────────────────────────────────────────────────────────────────────────────
function runHashThread() {
  const { address, batchSize, batchDelayMs, intensity } = workerData;
  let job = null, target = "", nonce = 0n, hashes = 0, running = true;
  setInterval(() => { if (hashes) { parentPort.postMessage({ type: "hashes", count: hashes }); hashes = 0; } }, 1000);
  const norm = (t) => { t = String(t).toLowerCase().replace(/^0x/, ""); return t.length > 64 ? "f".repeat(64) : t.padStart(64, "0"); };
  parentPort.on("message", (m) => {
    if (m.type === "job") { job = m.job; if (job) { target = norm(job.target); nonce = BigInt(job.nonceStart || "0"); } }
    else if (m.type === "stop") { running = false; process.exit(0); }
  });
  const loop = () => {
    if (!running) return;
    if (!job) return setTimeout(loop, 200);
    const cur = job, t0 = Date.now();
    for (let i = 0; i < batchSize && job === cur; i++) {
      const hash = createHash("sha256").update(`${cur.prevBlockHash}${address}${nonce.toString()}`).digest("hex");
      hashes++;
      if (hash < target) parentPort.postMessage({ type: "share", jobId: cur.jobId, nonce: nonce.toString(16), hash });
      nonce++;
    }
    const busy = Date.now() - t0;
    const pause = intensity < 100 ? Math.round((busy * (100 - intensity)) / intensity) : 0;
    setTimeout(loop, batchDelayMs + pause);
  };
  loop();
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(DIR, ".env"));

const env = (k, d = "") => (process.env[k] ?? d).trim();
const CFG = {
  dashboard: env("DASHBOARD_URL").replace(/\/+$/, ""),
  token: env("RIG_TOKEN"),
  name: env("RIG_NAME", os.hostname()),
  allowGpuOc: env("ALLOW_GPU_OC", "false").toLowerCase() === "true",
  autoUpdate: env("AUTO_UPDATE", "false").toLowerCase() === "true",
  paths: {
    xmrig: env("XMRIG_PATH", "xmrig"),
    trex: env("TREX_PATH", "t-rex"),
    lolminer: env("LOLMINER_PATH", "lolMiner"),
    srbminer: env("SRBMINER_PATH", "SRBMiner-MULTI"),
    cgminer: env("CGMINER_PATH", "cgminer"),
  },
};
const STATE_FILE = path.join(DIR, "state.json");

// ─────────────────────────────────────────────────────────────────────────────
// Logging (local console + buffered for the dashboard)
// ─────────────────────────────────────────────────────────────────────────────
const pendingLog = [];
function log(line) {
  const entry = `[${new Date().toISOString()}] ${String(line).replace(/\x1b\[[0-9;]*m/g, "").slice(0, 480)}`;
  console.log(entry);
  pendingLog.push(entry);
  if (pendingLog.length > 100) pendingLog.shift();
}

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 << 20 }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardware detection
// ─────────────────────────────────────────────────────────────────────────────
async function detectHardware() {
  const cpus = os.cpus();
  const hw = {
    cpuModel: (cpus[0]?.model || "Unknown CPU").replace(/\s+/g, " ").trim(),
    cpus: cpus.length || 1,
    memGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    arch: os.arch(),
    gpus: [],
  };
  const seen = new Set();
  const add = (g) => { const k = `${g.vendor}:${g.name}:${g.index ?? hw.gpus.length}`; if (!seen.has(k)) { seen.add(k); hw.gpus.push(g); } };

  const nv = await run("nvidia-smi", ["--query-gpu=index,name,memory.total,driver_version,power.default_limit", "--format=csv,noheader,nounits"]);
  if (nv) for (const l of nv.trim().split("\n").filter(Boolean)) {
    const [index, name, mem, driver, pl] = l.split(",").map((s) => s.trim());
    add({ index: Number(index), vendor: "NVIDIA", name, memMb: Number(mem) || undefined, driver, defaultPowerW: Number(pl) || undefined });
  }

  if (process.platform === "linux") {
    const roc = await run("rocm-smi", ["--showproductname", "--json"]);
    if (roc) {
      try {
        for (const [card, v] of Object.entries(JSON.parse(roc))) {
          const name = v["Card series"] || v["Card SKU"] || v["Card model"] || card;
          add({ index: Number(String(card).replace(/\D/g, "")) || 0, vendor: "AMD", name });
        }
      } catch { /* ignore */ }
    }
    const pci = await run("lspci", []);
    if (pci) for (const l of pci.split("\n")) {
      if (!/(VGA|3D|Display) controller/i.test(l)) continue;
      const name = l.replace(/^.*?controller:\s*/i, "").trim();
      const vendor = /nvidia/i.test(name) ? "NVIDIA" : /amd|ati|radeon/i.test(name) ? "AMD" : /intel/i.test(name) ? "Intel" : "Other";
      if (vendor === "NVIDIA" && hw.gpus.some((g) => g.vendor === "NVIDIA")) continue;
      if (vendor === "AMD" && hw.gpus.some((g) => g.vendor === "AMD")) continue;
      add({ vendor, name });
    }
  } else if (process.platform === "win32") {
    const ps = await run("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"]);
    if (ps) {
      try {
        const list = [].concat(JSON.parse(ps));
        for (const g of list) {
          const name = String(g.Name || "");
          const vendor = /nvidia/i.test(name) ? "NVIDIA" : /amd|radeon/i.test(name) ? "AMD" : /intel/i.test(name) ? "Intel" : "Other";
          if (vendor === "NVIDIA" && hw.gpus.some((x) => x.vendor === "NVIDIA")) continue;
          add({ vendor, name, memMb: g.AdapterRAM ? Math.round(g.AdapterRAM / 1048576) : undefined });
        }
      } catch { /* ignore */ }
    }
  } else if (process.platform === "darwin") {
    const sp = await run("system_profiler", ["SPDisplaysDataType", "-json"], 15000);
    if (sp) {
      try {
        for (const g of JSON.parse(sp).SPDisplaysDataType || []) add({ vendor: g.spdisplays_vendor || "Apple", name: g.sppci_model || g._name });
      } catch { /* ignore */ }
    }
  }
  return hw;
}

async function deviceStats(hw) {
  const devices = [];
  if (hw.gpus.some((g) => g.vendor === "NVIDIA")) {
    const out = await run("nvidia-smi", ["--query-gpu=name,temperature.gpu,power.draw,fan.speed", "--format=csv,noheader,nounits"]);
    if (out) for (const l of out.trim().split("\n").filter(Boolean)) {
      const [name, temp, power, fan] = l.split(",").map((s) => s.trim());
      devices.push({ name, type: "gpu", temp: Number(temp) || undefined, power: Math.round(Number(power)) || undefined, fan: Number(fan) || undefined });
    }
  }
  let cpuTemp;
  try { cpuTemp = Math.round(Number(fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8")) / 1000) || undefined; } catch { /* none */ }
  devices.unshift({ name: hw.cpuModel, type: "cpu", temp: cpuTemp });
  return devices;
}

// ─────────────────────────────────────────────────────────────────────────────
// Miners
// ─────────────────────────────────────────────────────────────────────────────
const RECONNECT = [5000, 15000, 30000, 60000, 120000, 300000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function effectiveThreads(t) {
  const cores = os.cpus().length || 1;
  const base = t.cpuThreads > 0 ? Math.floor(t.cpuThreads) : cores;
  const oc = Number.isFinite(t.cpuOverclock) && t.cpuOverclock >= 0.5 ? t.cpuOverclock : 1;
  return Math.min(64, Math.max(1, Math.round(base * oc)));
}

/** Built-in GYDS miner: JSON-RPC to the profile's nodes with ordered failover. Never gives up until stopped. */
class BuiltinMiner {
  constructor(profile, tuning) {
    this.p = profile; this.t = tuning;
    this.endpoints = (profile.endpoints?.length ? profile.endpoints : [{ label: "Node", url: profile.poolUrl }]).filter((e) => e.url);
    this.idx = 0; this.workers = []; this.job = null; this.session = null; this.alive = true;
    this.stats = { hashRate: 0, accepted: 0, rejected: 0, reward: 0, threads: 0, history: [], pool: "", error: null, startedAt: Date.now() };
    this.hashes = 0; this.timers = [];
  }

  async rpc(method, params) {
    if (!this.endpoints.length) throw new Error("No node URL in this profile.");
    let last;
    for (let a = 0; a < this.endpoints.length; a++) {
      const i = (this.idx + a) % this.endpoints.length, ep = this.endpoints[i];
      try {
        const h = { "Content-Type": "application/json" };
        if (ep.cfClientId) h["CF-Access-Client-Id"] = ep.cfClientId;
        if (ep.cfClientSecret) h["CF-Access-Client-Secret"] = ep.cfClientSecret;
        const res = await fetch(ep.url, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }), signal: AbortSignal.timeout(15000) });
        if ((res.headers.get("content-type") || "").includes("text/html")) throw new Error(`[${ep.label}] Returned HTML — likely Cloudflare Access. Set the CF token.`);
        if (!res.ok) throw new Error(`[${ep.label}] HTTP ${res.status}`);
        const body = await res.json();
        if (body.error) throw new Error(body.error.message || "RPC error");
        if (a > 0) log(`✓ Failover: now using "${ep.label}" (${ep.url})`);
        this.idx = i; this.stats.pool = ep.label;
        return body.result;
      } catch (e) { last = e; }
    }
    throw last;
  }

  async start() {
    let attempt = 0;
    while (this.alive) {
      try {
        const c = await this.rpc("mining_connect", { minerAddress: this.p.wallet, workerName: this.p.worker, mode: this.p.mode || "pool" });
        this.session = c.sessionId; this.stats.pool = c.poolName || this.stats.pool; this.stats.error = null;
        log(`Connected to ${this.stats.pool || "node"} — mining ${this.p.coin} as "${this.p.worker}"`);
        break;
      } catch (e) {
        this.stats.error = e.message;
        const d = RECONNECT[Math.min(attempt++, RECONNECT.length - 1)];
        log(`Connect failed: ${e.message} — retrying in ${d / 1000}s`);
        await sleep(d);
      }
    }
    if (!this.alive) return;
    await this.fetchWork();
    this.spawn();
    this.timers.push(setInterval(() => this.fetchWork(), 15000));
    this.timers.push(setInterval(() => {
      this.stats.hashRate = this.hashes; this.hashes = 0;
      this.stats.history.push(this.stats.hashRate); if (this.stats.history.length > 120) this.stats.history.shift();
    }, 1000));
  }

  spawn() {
    const n = effectiveThreads(this.t);
    this.stats.threads = n;
    for (let i = 0; i < n; i++) {
      const w = new Worker(SELF, { workerData: { address: this.p.wallet, batchSize: this.t.batchSize || 20000, batchDelayMs: this.t.batchDelayMs || 0, intensity: this.t.cpuIntensity || 100 } });
      w.on("message", (m) => this.onMsg(m));
      w.on("error", (e) => log(`Thread ${i} error: ${e.message}`));
      this.workers.push(w);
    }
    log(`Started ${n} CPU thread(s).`);
    this.sendJob();
  }

  sendJob() {
    if (!this.job) return;
    this.workers.forEach((w, i) => w.postMessage({ type: "job", job: { ...this.job, nonceStart: (BigInt(this.job.nonceStart) + BigInt(i) * 1_000_000_000n).toString() } }));
  }

  async fetchWork() {
    try {
      const work = await this.rpc("mining_getWork", { sessionId: this.session });
      if (!work) return;
      this.job = { ...work, nonceStart: String(Math.floor(Math.random() * 1e9)) };
      this.stats.blockHeight = work.blockHeight; this.stats.error = null;
      this.sendJob();
    } catch (e) {
      this.stats.error = e.message;
      log(`Failed to fetch work: ${e.message}`);
      if (/session/i.test(e.message)) { this.stop(); this.alive = true; this.workers = []; this.timers = []; this.start(); }
    }
  }

  async onMsg(m) {
    if (m.type === "hashes") { this.hashes += m.count; return; }
    if (m.type !== "share" || !this.job || m.jobId !== this.job.jobId) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await this.rpc("mining_submitShare", { sessionId: this.session, nonce: m.nonce, hash: m.hash, jobId: m.jobId });
        if (r?.accepted) { this.stats.accepted++; this.stats.reward += Number(r.reward || 0); log(`Share accepted! Reward: ${r.reward ?? 0} ${this.p.coin}`); await this.fetchWork(); }
        else { this.stats.rejected++; log(`Share rejected: ${r?.message || "unknown reason"}`); }
        return;
      } catch (e) {
        if (attempt === 2) { this.stats.rejected++; log(`Failed to submit share: ${e.message}`); }
        else await sleep(2000);
      }
    }
  }

  stop() {
    this.alive = false;
    this.timers.forEach(clearInterval); this.timers = [];
    for (const w of this.workers) { try { w.postMessage({ type: "stop" }); w.terminate(); } catch { /* gone */ } }
    this.workers = [];
    if (this.session) this.rpc("mining_disconnect", { sessionId: this.session }).catch(() => {});
    this.session = null; this.stats.hashRate = 0;
  }
}

const UNIT = { "": 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9, t: 1e12, T: 1e12, p: 1e15, P: 1e15 };

/** Build the command line for an external mining program. Exported shape is tested in the dashboard repo. */
function minerArgs(p, t, allowOc) {
  const user = p.wallet + (p.worker ? `.${p.worker}` : "");
  const pass = p.password || "x";
  const extra = (p.extraArgs || "").trim() ? p.extraArgs.trim().split(/\s+/) : [];
  const threads = t.cpuThreads > 0 ? Math.round(t.cpuThreads * (t.cpuOverclock || 1)) : 0;
  switch (p.miner) {
    case "xmrig": {
      const a = ["-o", p.poolUrl, "-u", p.wallet, "-p", pass, "--rig-id", p.worker || CFG.name, "-k", "--donate-level", "1"];
      if (p.algorithm) a.push("-a", p.algorithm);
      if (p.poolUrl.startsWith("stratum+ssl") || /:443$/.test(p.poolUrl)) a.push("--tls");
      if (p.device === "gpu") a.push("--no-cpu", "--opencl", "--cuda");
      else { if (threads) a.push("-t", String(threads)); if (t.cpuIntensity && t.cpuIntensity < 100) a.push("--cpu-max-threads-hint", String(t.cpuIntensity)); }
      return [...a, ...extra];
    }
    case "trex": {
      const a = ["-a", p.algorithm, "-o", p.poolUrl, "-u", p.wallet, "-p", pass, "-w", p.worker || CFG.name];
      if (t.gpuIntensity) a.push("-i", String(t.gpuIntensity));
      if (allowOc) {
        if (t.gpuPowerLimit) a.push("--pl", `${t.gpuPowerLimit}%`);
        if (t.gpuCoreOffset) a.push("--cclock", String(t.gpuCoreOffset));
        if (t.gpuMemOffset) a.push("--mclock", String(t.gpuMemOffset));
        if (t.gpuFan) a.push("--fan", String(t.gpuFan));
      }
      return [...a, ...extra];
    }
    case "lolminer": {
      const a = ["--algo", p.algorithm.toUpperCase(), "--pool", p.poolUrl.replace(/^stratum\+(tcp|ssl):\/\//, ""), "--user", user, "--pass", pass];
      if (p.poolUrl.startsWith("stratum+ssl")) a.push("--tls", "on");
      if (allowOc) {
        if (t.gpuCoreOffset) a.push("--coff", String(t.gpuCoreOffset));
        if (t.gpuMemOffset) a.push("--moff", String(t.gpuMemOffset));
        if (t.gpuFan) a.push("--fan", String(t.gpuFan));
      }
      return [...a, ...extra];
    }
    case "srbminer": {
      const a = ["--algorithm", p.algorithm, "--pool", p.poolUrl.replace(/^stratum\+(tcp|ssl):\/\//, ""), "--wallet", p.wallet, "--worker", p.worker || CFG.name, "--password", pass];
      if (p.poolUrl.startsWith("stratum+ssl")) a.push("--tls", "true");
      if (p.device === "gpu") a.push("--disable-cpu"); else { a.push("--disable-gpu"); if (threads) a.push("--cpu-threads", String(threads)); }
      if (t.gpuIntensity && p.device === "gpu") a.push("--gpu-intensity", String(t.gpuIntensity));
      return [...a, ...extra];
    }
    case "cgminer":
      return ["-o", p.poolUrl, "-u", user, "-p", pass, "--text-only", ...extra];
    default:
      throw new Error(`Unknown mining program "${p.miner}".`);
  }
}

/** Runs an external mining program and restarts it if it crashes, until stopped. */
class ExternalMiner {
  constructor(profile, tuning) {
    this.p = profile; this.t = tuning; this.alive = true; this.child = null;
    this.stats = { hashRate: 0, accepted: 0, rejected: 0, reward: 0, threads: 0, history: [], pool: profile.poolUrl, error: null, startedAt: Date.now() };
  }

  async start() {
    const bin = CFG.paths[this.p.miner];
    let args;
    try { args = minerArgs(this.p, this.t, CFG.allowGpuOc); } catch (e) { this.stats.error = e.message; log(e.message); return; }
    if (CFG.allowGpuOc) await applyNvidiaPowerLimit(this.t.gpuPowerLimit);
    let crashes = 0;
    while (this.alive) {
      log(`Starting ${this.p.miner}: ${bin} ${args.join(" ").replace(this.p.password || "\u0000", "***")}`);
      const started = Date.now();
      const code = await new Promise((resolve) => {
        let child;
        try { child = spawn(bin, args, { cwd: DIR, windowsHide: true }); } catch (e) { this.stats.error = e.message; return resolve(-1); }
        this.child = child;
        const onData = (buf) => { for (const l of String(buf).split(/\r?\n/)) if (l.trim()) this.parse(l); };
        child.stdout.on("data", onData); child.stderr.on("data", onData);
        child.on("error", (e) => {
          this.stats.error = e.code === "ENOENT" ? `${this.p.miner} not found at "${bin}". Install it and set its path in .env.` : e.message;
          log(this.stats.error);
        });
        child.on("exit", (c) => resolve(c));
      });
      this.child = null; this.stats.hashRate = 0;
      if (!this.alive) break;
      crashes = Date.now() - started > 120000 ? 0 : crashes + 1;
      const d = RECONNECT[Math.min(crashes, RECONNECT.length - 1)];
      log(`${this.p.miner} exited (code ${code}) — restarting in ${d / 1000}s`);
      await sleep(d);
    }
  }

  parse(line) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    let hr = null;
    const xm = clean.match(/speed 10s\/60s\/15m\s+([\d.]+)/);
    if (xm) hr = Number(xm[1]);
    else {
      const all = [...clean.matchAll(/(\d+(?:\.\d+)?)\s*([kKmMgGtTpP]?)(?:H|Sol|h)\/s/g)];
      const last = all[all.length - 1];
      if (last) hr = Number(last[1]) * (UNIT[last[2]] || 1);
    }
    if (hr != null && Number.isFinite(hr)) {
      this.stats.hashRate = hr; this.stats.history.push(hr); if (this.stats.history.length > 120) this.stats.history.shift();
    }
    if (/\baccepted\b/i.test(clean)) this.stats.accepted++;
    else if (/\brejected\b/i.test(clean)) this.stats.rejected++;
    if (/accepted|rejected|error|fail|connect|new job|login/i.test(clean)) log(`[${this.p.miner}] ${clean.trim()}`);
  }

  stop() {
    this.alive = false;
    if (this.child) { try { this.child.kill("SIGTERM"); } catch { /* gone */ } const c = this.child; setTimeout(() => { try { c.kill("SIGKILL"); } catch { /* gone */ } }, 5000); }
  }
}

async function applyNvidiaPowerLimit(pct) {
  if (!pct || !hardware?.gpus.some((g) => g.vendor === "NVIDIA" && g.defaultPowerW)) return;
  for (const g of hardware.gpus.filter((x) => x.vendor === "NVIDIA" && x.defaultPowerW)) {
    const watts = Math.round((g.defaultPowerW * pct) / 100);
    const out = await run("nvidia-smi", ["-i", String(g.index), "-pl", String(watts)]);
    log(out ? `GPU ${g.index}: power limit ${watts} W` : `GPU ${g.index}: could not set power limit (needs admin/root)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller: keeps the miner matching what the dashboard wants
// ─────────────────────────────────────────────────────────────────────────────
let hardware = null;
let miner = null;
let minerKey = "";
let status = "idle";

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { desiredState: "stopped", profile: null, tuning: {} }; } }
function saveState(s) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e) { log(`Could not save state: ${e.message}`); } }

function stopMiner(reason) {
  if (miner) { miner.stop(); log(`Mining stopped${reason ? ` (${reason})` : ""}.`); }
  miner = null; minerKey = ""; status = "idle";
}

function reconcile(state, force = false) {
  const { desiredState, profile, tuning } = state;
  if (desiredState !== "running") { if (miner) stopMiner("stopped from dashboard"); return; }
  if (!profile) { if (miner) stopMiner("no mining profile"); status = "error"; return; }
  if (profile.coin !== "GYDS" && profile.miner !== "builtin" && !profile.poolUrl) { status = "error"; return; }
  const key = JSON.stringify({ id: profile.id, u: profile.updatedAt, t: tuning });
  if (!force && miner && key === minerKey) return;
  if (miner) stopMiner(force ? "restart" : "settings changed");
  miner = profile.miner === "builtin" ? new BuiltinMiner(profile, tuning || {}) : new ExternalMiner(profile, tuning || {});
  minerKey = key; status = "starting";
  miner.start().catch((e) => { log(`Miner error: ${e.message}`); status = "error"; });
}

async function selfUpdate(latest) {
  const res = await fetch(`${CFG.dashboard}/rig-agent/agent.mjs`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const code = await res.text();
  const v = code.match(/const AGENT_VERSION = "([\d.]+)"/)?.[1];
  if (!v) throw new Error("Downloaded file is not the rig program.");
  if (v === AGENT_VERSION) return `Already on v${v}`;
  fs.writeFileSync(`${SELF}.new`, code);
  fs.renameSync(`${SELF}.new`, SELF);
  log(`Updated rig program v${AGENT_VERSION} → v${v}${latest && latest !== v ? ` (dashboard says ${latest})` : ""}. Restarting…`);
  return `Updated to v${v}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!CFG.dashboard || !CFG.token) {
    console.error("DASHBOARD_URL and RIG_TOKEN must be set in .env (see .env.example).");
    process.exit(2);
  }
  log(`GYDS rig program v${AGENT_VERSION} on ${os.hostname()} (${process.platform}/${os.arch()}, Node ${process.version})`);
  hardware = await detectHardware();
  log(`Found ${hardware.cpus} CPU thread(s): ${hardware.cpuModel}; ${hardware.gpus.length} GPU(s)${hardware.gpus.length ? ": " + hardware.gpus.map((g) => g.name).join(", ") : ""}`);
  setInterval(async () => { hardware = await detectHardware(); }, 10 * 60 * 1000);

  // Resume what we were doing before a reboot / crash / update — keep mining until told to stop.
  let state = loadState();
  if (state.desiredState === "running") { log("Resuming mining from last saved settings."); reconcile(state); }

  const results = [];
  let failures = 0;
  let restartAfterBeat = false;

  const shutdown = () => { stopMiner("rig program shutting down"); setTimeout(() => process.exit(0), 300); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);

  while (true) {
    let poll = 10;
    try {
      const s = miner?.stats;
      if (miner && s) status = s.error && !s.hashRate ? "error" : s.hashRate > 0 ? "mining" : "starting";
      const body = {
        hostname: os.hostname(), platform: `${process.platform} ${os.release()} ${os.arch()}`, agentVersion: AGENT_VERSION,
        status: miner ? status : state.desiredState === "running" ? "error" : "idle",
        hardware,
        stats: s ? { hashRate: s.hashRate, accepted: s.accepted, rejected: s.rejected, reward: s.reward, threads: s.threads, pool: s.pool, error: s.error, blockHeight: s.blockHeight, uptime: Math.round((Date.now() - s.startedAt) / 1000), history: s.history.slice(-60), devices: await deviceStats(hardware) } : { devices: await deviceStats(hardware) },
        log: pendingLog.splice(0, 100),
        commandResults: results.splice(0, 50),
      };
      const res = await fetch(`${CFG.dashboard}/api/public/rig/heartbeat`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CFG.token}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
      if (res.status === 401) { log("Dashboard rejected the RIG_TOKEN. Create a new token on the rig's page and update .env."); poll = 60; }
      else if (!res.ok) throw new Error(`HTTP ${res.status}`);
      else {
        if (failures) log("Reconnected to the dashboard.");
        failures = 0;
        if (restartAfterBeat) { stopMiner("updating"); process.exit(0); }
        const data = await res.json();
        poll = data.pollSeconds || 10;
        state = { desiredState: data.rig.desiredState, profile: data.profile, tuning: data.rig.tuning || {} };
        saveState(state);
        let force = false;
        for (const c of data.commands || []) {
          try {
            if (c.command === "restart") { force = true; results.push({ id: c.id, ok: true, message: "Restarting miner" }); }
            else if (c.command === "update") {
              const msg = await selfUpdate(data.latestAgentVersion);
              results.push({ id: c.id, ok: true, message: msg });
              if (msg.startsWith("Updated")) restartAfterBeat = true;
            } else results.push({ id: c.id, ok: true, message: c.command === "stop" ? "Stopping" : "Applied" });
          } catch (e) { results.push({ id: c.id, ok: false, message: e.message }); log(`Command ${c.command} failed: ${e.message}`); }
        }
        if (CFG.autoUpdate && data.latestAgentVersion && newer(data.latestAgentVersion, AGENT_VERSION) && !restartAfterBeat) {
          try { const msg = await selfUpdate(data.latestAgentVersion); if (msg.startsWith("Updated")) restartAfterBeat = true; }
          catch (e) { log(`Auto-update failed: ${e.message}`); }
        } else if (data.latestAgentVersion && newer(data.latestAgentVersion, AGENT_VERSION) && !restartAfterBeat && Math.random() < 0.02) {
          log(`Update available: v${data.latestAgentVersion} (you have v${AGENT_VERSION}). Press Update on the dashboard.`);
        }
        reconcile(state, force);
        if (restartAfterBeat) poll = 1;
      }
    } catch (e) {
      failures++;
      poll = Math.min(60, 10 * failures);
      if (failures === 1 || failures % 10 === 0) log(`Can't reach the dashboard (${e.message}). ${miner ? "Still mining with the last settings." : ""} Retrying…`);
    }
    await sleep(poll * 1000);
  }
}

function newer(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
