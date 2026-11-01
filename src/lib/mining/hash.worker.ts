/// <reference lib="webworker" />
// One browser mining thread. Port of the original worker.js:
// hashes candidate nonces against the current job's target, reports hash
// counts every second, and posts shares. batchDelayMs throttles CPU use.
import { computeHash, meetsTarget, normaliseTarget } from "./hash";

type Job = { jobId: string; prevBlockHash: string; target: string; nonceStart: string };
type InMsg =
  | { type: "init"; minerAddress: string; batchSize: number; batchDelayMs: number }
  | { type: "job"; job: Job | null }
  | { type: "stop" };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let job: Job | null = null;
let target = "";
let nonce = 0n;
let minerAddress = "";
let batchSize = 20000;
let batchDelayMs = 0;
let running = true;
let hashes = 0;
let loopScheduled = false;

setInterval(() => {
  if (hashes > 0) {
    ctx.postMessage({ type: "hashes", count: hashes });
    hashes = 0;
  }
}, 1000);

function schedule(delay: number) {
  if (loopScheduled || !running) return;
  loopScheduled = true;
  setTimeout(() => {
    loopScheduled = false;
    mineLoop();
  }, delay);
}

function mineLoop() {
  if (!running) return;
  if (!job) return schedule(200);
  const current = job;
  for (let i = 0; i < batchSize && running && job === current; i++) {
    const n = nonce.toString();
    const hash = computeHash(current.prevBlockHash, minerAddress, n);
    hashes++;
    if (meetsTarget(hash, target)) {
      ctx.postMessage({ type: "share", jobId: current.jobId, nonce: nonce.toString(16), hash });
    }
    nonce++;
  }
  schedule(batchDelayMs);
}

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    minerAddress = msg.minerAddress;
    batchSize = msg.batchSize >= 100 ? Math.floor(msg.batchSize) : 20000;
    batchDelayMs = msg.batchDelayMs >= 0 ? Math.floor(msg.batchDelayMs) : 0;
  } else if (msg.type === "job") {
    job = msg.job;
    if (job) {
      target = normaliseTarget(job.target);
      nonce = BigInt(job.nonceStart || "0");
    }
    schedule(0);
  } else if (msg.type === "stop") {
    running = false;
  }
};
