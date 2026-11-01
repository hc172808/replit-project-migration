// Browser mining engine — port of the original miner.js state machine:
// connect → getWork (every 15s) → hash in Web Workers → submit shares (1 retry)
// with ordered endpoint failover, reconnect back-off, circuit breaker after
// 20 attempts, and a 60s stalled-thread watchdog. Runs only in the browser,
// only after the user presses Start, and only while the tab stays open.

export type MinerConfig = {
  walletAddress: string;
  miningMode: "pool" | "solo";
  workerName: string;
  threads: number; // 0 = auto (all cores)
  overclock: number;
  batchSize: number;
  batchDelayMs: number;
};

export type RpcCaller = (
  method: string,
  params: Record<string, unknown>,
  preferredIdx: number,
) => Promise<
  | { ok: true; resultJson: string; activeIdx: number; activeEndpointId: string; notes: string[] }
  | { ok: false; error: string; notes: string[]; activeIdx: number }
>;

export type StatsRecorder = (delta: {
  shares?: number;
  rejected?: number;
  reward?: number;
  seconds?: number;
  newSession?: boolean;
}) => Promise<void>;

export type MinerState = {
  running: boolean;
  connected: boolean;
  actionInProgress: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectAt: number | null;
  circuitOpen: boolean;
  sessionId: string | null;
  poolName: string | null;
  hashRate: number;
  hashHistory: { ts: number; hr: number }[];
  validShares: number;
  rejectedShares: number;
  totalReward: number;
  currentDifficulty: number | string | null;
  blockHeight: number;
  startTime: number | null;
  lastError: string | null;
  log: string[];
  activeEndpointIdx: number;
  activeEndpointId: string | null;
  effectiveThreads: number;
};

type Job = { jobId: string; prevBlockHash: string; target: string; nonceStart: string; blockHeight?: number; difficulty?: number };

export const MAX_RECONNECT_ATTEMPTS = 20;
const RECONNECT_DELAYS = [5000, 15000, 30000, 60000, 120000, 300000];

export function reconnectDelay(attempt: number): number {
  return RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
}

export function computeEffectiveThreads(threads: number, overclock: number, cores: number): number {
  const base = threads > 0 ? Math.floor(threads) : Math.max(1, cores);
  const oc = Number.isFinite(overclock) && overclock >= 0.5 ? overclock : 1;
  return Math.min(64, Math.max(1, Math.round(base * oc)));
}

function initialState(): MinerState {
  return {
    running: false, connected: false, actionInProgress: false,
    reconnecting: false, reconnectAttempt: 0, reconnectAt: null, circuitOpen: false,
    sessionId: null, poolName: null, hashRate: 0, hashHistory: [],
    validShares: 0, rejectedShares: 0, totalReward: 0,
    currentDifficulty: null, blockHeight: 0, startTime: null, lastError: null, log: [],
    activeEndpointIdx: 0, activeEndpointId: null, effectiveThreads: 0,
  };
}

export class MiningEngine {
  state: MinerState = initialState();
  private listeners = new Set<() => void>();
  private workers: Worker[] = [];
  private currentJob: Job | null = null;
  private hashesThisSecond = 0;
  private lastHashTime = 0;
  private workInterval: ReturnType<typeof setInterval> | null = null;
  private hashRateInterval: ReturnType<typeof setInterval> | null = null;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStatsFlush = 0;
  private config: MinerConfig | null = null;

  constructor(private rpcCaller: RpcCaller, private recordStats: StatsRecorder) {}

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.state = { ...this.state };
    for (const l of this.listeners) l();
  }

  pushLog(line: string) {
    const entry = `[${new Date().toISOString()}] ${line}`;
    const log = [...this.state.log, entry];
    if (log.length > 300) log.shift();
    this.state.log = log;
    this.emit();
  }

  clearLog() {
    this.state.log = [];
    this.emit();
  }

  private async rpc<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const r = await this.rpcCaller(method, params, this.state.activeEndpointIdx);
    for (const n of r.notes) this.pushLog(n);
    this.state.activeEndpointIdx = r.activeIdx;
    if (!r.ok) throw new Error(r.error);
    this.state.activeEndpointId = r.activeEndpointId;
    return JSON.parse(r.resultJson) as T;
  }

  private async submitShare(params: Record<string, unknown>) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.rpc<{ accepted?: boolean; reward?: number; message?: string }>("mining_submitShare", params);
      } catch (err) {
        if (attempt === 2) throw err;
        this.pushLog(`Share submit failed, retrying… (${(err as Error).message})`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  // ── Workers ────────────────────────────────────────────────────────────
  private spawnWorker(index: number): Worker {
    const w = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });
    w.postMessage({
      type: "init",
      minerAddress: this.config!.walletAddress,
      batchSize: this.config!.batchSize,
      batchDelayMs: this.config!.batchDelayMs,
    });
    w.onmessage = (e) => this.onWorkerMessage(e.data);
    w.onerror = (e) => {
      this.pushLog(`Thread ${index} error: ${e.message} — restarting…`);
      const idx = this.workers.indexOf(w);
      if (idx !== -1 && this.state.running) {
        w.terminate();
        const rep = this.spawnWorker(idx);
        this.workers[idx] = rep;
        this.sendJob(rep, idx);
      }
    };
    return w;
  }

  private spawnWorkers() {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
    const n = computeEffectiveThreads(this.config!.threads, this.config!.overclock, cores);
    this.state.effectiveThreads = n;
    for (let i = 0; i < n; i++) this.workers.push(this.spawnWorker(i));
    this.lastHashTime = Date.now();
    this.pushLog(`Spawned ${n} thread(s) (batch=${this.config!.batchSize}, delay=${this.config!.batchDelayMs}ms).`);
    this.broadcastJob();
  }

  private stopWorkers() {
    const toStop = this.workers.splice(0);
    for (const w of toStop) {
      try { w.postMessage({ type: "stop" }); w.terminate(); } catch { /* already gone */ }
    }
  }

  private sendJob(w: Worker, index: number) {
    if (!this.currentJob) return;
    // Give each thread its own nonce range so threads never repeat work.
    const start = BigInt(this.currentJob.nonceStart) + BigInt(index) * 1_000_000_000n;
    w.postMessage({ type: "job", job: { ...this.currentJob, nonceStart: start.toString() } });
  }

  private broadcastJob() {
    this.workers.forEach((w, i) => this.sendJob(w, i));
  }

  private async onWorkerMessage(msg: { type: string; count?: number; jobId?: string; nonce?: string; hash?: string }) {
    if (msg.type === "hashes") {
      this.hashesThisSecond += msg.count ?? 0;
      this.lastHashTime = Date.now();
    } else if (msg.type === "share") {
      if (!this.currentJob || msg.jobId !== this.currentJob.jobId) return;
      try {
        const result = await this.submitShare({
          sessionId: this.state.sessionId, nonce: msg.nonce, hash: msg.hash, jobId: msg.jobId,
        });
        if (result?.accepted) {
          const reward = Number(result.reward || 0);
          this.state.validShares++;
          this.state.totalReward += reward;
          void this.recordStats({ shares: 1, reward });
          this.pushLog(`Share accepted! Reward: ${result.reward ?? 0} GYDS`);
          await this.fetchNewWork();
        } else {
          this.state.rejectedShares++;
          void this.recordStats({ rejected: 1 });
          this.pushLog(`Share rejected: ${result?.message || "unknown reason"}`);
        }
      } catch (err) {
        this.state.rejectedShares++;
        void this.recordStats({ rejected: 1 });
        this.pushLog(`Failed to submit share: ${(err as Error).message}`);
      }
    }
  }

  // ── Work fetch ─────────────────────────────────────────────────────────
  private async fetchNewWork() {
    try {
      const work = await this.rpc<Omit<Job, "nonceStart"> | null>("mining_getWork", { sessionId: this.state.sessionId });
      if (!work) return;
      this.currentJob = { ...work, nonceStart: String(Math.floor(Math.random() * 1e9)) };
      this.state.blockHeight = work.blockHeight ?? this.state.blockHeight;
      this.state.currentDifficulty = work.difficulty ?? this.state.currentDifficulty;
      this.broadcastJob();
      this.emit();
    } catch (err) {
      this.pushLog(`Failed to fetch work: ${(err as Error).message}`);
      if (this.state.running && !this.state.reconnecting) this.scheduleReconnect();
    }
  }

  // ── Reconnect / circuit breaker ────────────────────────────────────────
  private cancelReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.state.reconnecting = false; this.state.reconnectAttempt = 0; this.state.reconnectAt = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.state.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.state.circuitOpen = true; this.state.reconnecting = false; this.state.reconnectAt = null;
      this.pushLog(`⛔ Circuit breaker: gave up after ${MAX_RECONNECT_ATTEMPTS} attempts. Click Start to retry manually.`);
      return;
    }
    const delay = reconnectDelay(this.state.reconnectAttempt);
    this.state.reconnecting = true; this.state.reconnectAt = Date.now() + delay;
    this.pushLog(`Connection lost — reconnecting in ${delay / 1000}s (${this.state.reconnectAttempt + 1}/${MAX_RECONNECT_ATTEMPTS})…`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null; this.state.reconnectAt = null; this.state.reconnectAttempt++;
      this.stopWorkers(); this.state.connected = false; this.state.sessionId = null;
      try {
        await this.connect();
        this.state.reconnecting = false; this.state.reconnectAttempt = 0; this.state.circuitOpen = false;
        this.pushLog(`Reconnected to ${this.state.poolName || "pool"}.`);
        await this.fetchNewWork(); this.spawnWorkers();
      } catch (err) {
        this.state.lastError = (err as Error).message;
        this.pushLog(`Reconnect failed: ${(err as Error).message}`);
        this.scheduleReconnect();
      }
    }, delay);
    this.emit();
  }

  private async connect() {
    const cfg = this.config!;
    const conn = await this.rpc<{ sessionId: string; poolName?: string }>("mining_connect", {
      minerAddress: cfg.walletAddress, workerName: cfg.workerName, mode: cfg.miningMode,
    });
    this.state.sessionId = conn.sessionId;
    this.state.poolName = conn.poolName || (cfg.miningMode === "solo" ? "Solo Node" : null);
    this.state.connected = true;
  }

  private flushSeconds() {
    if (!this.lastStatsFlush) return;
    const secs = Math.floor((Date.now() - this.lastStatsFlush) / 1000);
    if (secs > 0) {
      this.lastStatsFlush += secs * 1000;
      void this.recordStats({ seconds: secs });
    }
  }

  // ── Control ────────────────────────────────────────────────────────────
  async start(config: MinerConfig): Promise<{ ok: boolean; message: string }> {
    if (this.state.actionInProgress) return { ok: false, message: "Another action is in progress, please wait." };
    if (this.state.running) return { ok: true, message: "Already running" };
    if (!config.walletAddress) return { ok: false, message: "Set your GYDS wallet address in Wallet Settings first." };

    this.config = config;
    this.state.actionInProgress = true; this.state.circuitOpen = false;
    this.cancelReconnect();
    this.emit();

    try {
      await this.connect();
    } catch (err) {
      this.state.lastError = (err as Error).message; this.state.actionInProgress = false;
      this.pushLog(`Connection failed: ${(err as Error).message}`);
      return { ok: false, message: `Could not connect: ${(err as Error).message}` };
    }

    Object.assign(this.state, {
      running: true, startTime: Date.now(), validShares: 0, rejectedShares: 0, totalReward: 0,
      lastError: null, hashHistory: [],
    });
    this.lastHashTime = Date.now();
    this.lastStatsFlush = Date.now();
    void this.recordStats({ newSession: true });
    this.pushLog(`[${config.miningMode.toUpperCase()}] Mining GYDS as "${config.workerName}" (${config.walletAddress})`);

    await this.fetchNewWork();
    this.spawnWorkers();

    this.workInterval = setInterval(() => {
      this.fetchNewWork().catch((err) => {
        this.pushLog(`Work poll failed: ${(err as Error).message}`);
        if (!this.state.reconnecting) this.scheduleReconnect();
      });
    }, 15000);

    this.hashRateInterval = setInterval(() => {
      this.state.hashRate = this.hashesThisSecond; this.hashesThisSecond = 0;
      const h = [...this.state.hashHistory, { ts: Date.now(), hr: this.state.hashRate }];
      if (h.length > 300) h.shift();
      this.state.hashHistory = h;
      this.emit();
    }, 1000);

    this.watchdogInterval = setInterval(() => {
      if (!this.state.running || this.workers.length === 0) return;
      const staleMs = Date.now() - this.lastHashTime;
      if (staleMs > 60000) {
        this.pushLog(`⚠ Threads stalled ${Math.round(staleMs / 1000)}s — restarting threads…`);
        this.stopWorkers(); this.spawnWorkers();
      }
    }, 15000);

    this.statsInterval = setInterval(() => this.flushSeconds(), 30000);

    this.state.actionInProgress = false;
    this.emit();
    return { ok: true, message: "GYDS mining started" };
  }

  async stop(): Promise<{ ok: boolean; message: string }> {
    if (this.state.actionInProgress) return { ok: false, message: "Another action is in progress, please wait." };
    if (!this.state.running && !this.state.reconnecting) return { ok: true, message: "Already stopped" };
    this.state.actionInProgress = true;
    this.cancelReconnect();
    this.state.running = false;
    for (const t of [this.workInterval, this.hashRateInterval, this.watchdogInterval, this.statsInterval]) {
      if (t) clearInterval(t);
    }
    this.workInterval = this.hashRateInterval = this.watchdogInterval = this.statsInterval = null;
    this.stopWorkers();
    this.flushSeconds();
    this.lastStatsFlush = 0;
    try {
      if (this.state.sessionId) await this.rpc("mining_disconnect", { sessionId: this.state.sessionId });
    } catch { /* best effort */ }
    Object.assign(this.state, { connected: false, sessionId: null, hashRate: 0, effectiveThreads: 0 });
    this.pushLog("Mining stopped.");
    this.state.actionInProgress = false;
    this.emit();
    return { ok: true, message: "Mining stopped" };
  }

  /** Immediate teardown (tab closing / signing out). */
  destroy() {
    this.cancelReconnect();
    for (const t of [this.workInterval, this.hashRateInterval, this.watchdogInterval, this.statsInterval]) {
      if (t) clearInterval(t);
    }
    this.stopWorkers();
    if (this.state.running) this.flushSeconds();
    this.state.running = false;
    this.listeners.clear();
  }
}
