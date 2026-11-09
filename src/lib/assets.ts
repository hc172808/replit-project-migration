// Catalogue of supported coins and mining programs, shared by the dashboard
// and documented for the rig program (rig-agent/README.md).
import { DEFAULT_GYDS_RPC_URL } from "@/lib/mining/rpc-endpoints";

export type Device = "cpu" | "gpu" | "asic" | "browser";

export type MinerId = "builtin" | "xmrig" | "trex" | "lolminer" | "srbminer" | "cgminer";

export type AssetPreset = {
  coin: string;
  name: string;
  algorithm: string;
  protocol: "gyds-rpc" | "stratum";
  devices: Device[];
  miners: MinerId[];
  poolExample: string;
  walletHint: string;
  requirements: string[];
};

export const MINERS: Record<MinerId, { name: string; devices: Device[]; gpuTuning: boolean; note: string }> = {
  builtin: { name: "Built-in GYDS miner", devices: ["cpu", "browser"], gpuTuning: false, note: "Included in the rig program and the browser." },
  xmrig: { name: "XMRig", devices: ["cpu", "gpu"], gpuTuning: false, note: "Download from xmrig.com. CPU-first; set XMRIG_PATH in .env." },
  trex: { name: "T-Rex (NVIDIA)", devices: ["gpu"], gpuTuning: true, note: "NVIDIA only. Set TREX_PATH in .env." },
  lolminer: { name: "lolMiner (AMD/NVIDIA)", devices: ["gpu"], gpuTuning: true, note: "AMD and NVIDIA. Set LOLMINER_PATH in .env." },
  srbminer: { name: "SRBMiner-MULTI", devices: ["cpu", "gpu"], gpuTuning: false, note: "AMD/Intel/NVIDIA + CPU. Set SRBMINER_PATH in .env." },
  cgminer: { name: "CGMiner (ASIC)", devices: ["asic"], gpuTuning: false, note: "For USB/serial SHA-256 ASICs. Set CGMINER_PATH in .env." },
};

export const ASSETS: AssetPreset[] = [
  {
    coin: "GYDS", name: "GYDS Network", algorithm: "sha256-gyds", protocol: "gyds-rpc",
    devices: ["browser", "cpu"], miners: ["builtin"],
    poolExample: DEFAULT_GYDS_RPC_URL,
    walletHint: "0x… GYDS wallet address",
    requirements: [
      "Any CPU — works in a browser tab or the rig program.",
      "A GYDS node URL; add a Cloudflare Access token if the node is protected.",
    ],
  },
  {
    coin: "XMR", name: "Monero", algorithm: "rx/0", protocol: "stratum",
    devices: ["cpu"], miners: ["xmrig", "srbminer"],
    poolExample: "stratum+ssl://pool.supportxmr.com:443",
    walletHint: "Monero address (starts with 4 or 8)",
    requirements: [
      "64-bit CPU; about 2 MB L3 cache per mining thread.",
      "~2.5 GB free RAM for fast mode; huge pages recommended (run the rig program as admin/root once).",
      "XMRig 6.x installed on the rig.",
    ],
  },
  {
    coin: "RVN", name: "Ravencoin", algorithm: "kawpow", protocol: "stratum",
    devices: ["gpu"], miners: ["trex", "srbminer"],
    poolExample: "stratum+tcp://rvn.2miners.com:6060",
    walletHint: "Ravencoin address (starts with R)",
    requirements: ["GPU with 4 GB+ VRAM.", "T-Rex (NVIDIA) or SRBMiner-MULTI (AMD) installed."],
  },
  {
    coin: "ETC", name: "Ethereum Classic", algorithm: "etchash", protocol: "stratum",
    devices: ["gpu"], miners: ["lolminer", "trex"],
    poolExample: "stratum+tcp://etc.2miners.com:1010",
    walletHint: "0x… ETC address",
    requirements: ["GPU with 4 GB+ VRAM.", "lolMiner or T-Rex installed."],
  },
  {
    coin: "KAS", name: "Kaspa", algorithm: "kheavyhash", protocol: "stratum",
    devices: ["gpu", "asic"], miners: ["lolminer", "srbminer"],
    poolExample: "stratum+tcp://kas.2miners.com:2020",
    walletHint: "kaspa:… address",
    requirements: ["GPU (low profit vs ASICs) or a Kaspa ASIC.", "lolMiner or SRBMiner-MULTI installed."],
  },
  {
    coin: "BTC", name: "Bitcoin", algorithm: "sha256d", protocol: "stratum",
    devices: ["asic"], miners: ["cgminer"],
    poolExample: "stratum+tcp://solo.ckpool.org:3333",
    walletHint: "bc1… / 1… / 3… Bitcoin address",
    requirements: [
      "SHA-256 ASIC hardware — CPU and GPU mining Bitcoin earns effectively nothing.",
      "Network ASICs (Antminer etc.) are set up in their own web panel; USB ASICs run with CGMiner here.",
    ],
  },
  {
    coin: "CUSTOM-RPC", name: "Custom network (GYDS-style node)", algorithm: "sha256-gyds", protocol: "gyds-rpc",
    devices: ["browser", "cpu"], miners: ["builtin"],
    poolExample: "https://your-node.example.com/api/mining/rpc",
    walletHint: "Wallet address on that network",
    requirements: ["A node that speaks the mining_connect / mining_getWork / mining_submitShare protocol."],
  },
  {
    coin: "CUSTOM", name: "Custom coin (stratum pool)", algorithm: "", protocol: "stratum",
    devices: ["cpu", "gpu", "asic"], miners: ["xmrig", "trex", "lolminer", "srbminer", "cgminer"],
    poolExample: "stratum+tcp://pool.example.com:3333",
    walletHint: "Wallet or pool username",
    requirements: ["Type the algorithm name exactly as your mining program expects it."],
  },
];

export function assetFor(coin: string): AssetPreset {
  return ASSETS.find((a) => a.coin === coin) ?? ASSETS[ASSETS.length - 1]!;
}

/** Tuning a rig accepts. CPU "overclock" is a thread multiplier; GPU values are passed to the mining program. */
export type Tuning = {
  cpuThreads?: number; // 0 = auto
  cpuOverclock?: number; // thread multiplier 0.5–4
  cpuIntensity?: number; // % of CPU to use, 10–100
  batchSize?: number;
  batchDelayMs?: number;
  gpuIntensity?: number; // miner-specific intensity
  gpuPowerLimit?: number; // % 50–120
  gpuCoreOffset?: number; // MHz −500…+300
  gpuMemOffset?: number; // MHz −1000…+2000
  gpuFan?: number; // % 0 = auto, 30–100
};

export const TUNING_LIMITS = {
  cpuThreads: [0, 256],
  cpuOverclock: [0.5, 4],
  cpuIntensity: [10, 100],
  batchSize: [100, 10_000_000],
  batchDelayMs: [0, 60_000],
  gpuIntensity: [1, 30],
  gpuPowerLimit: [50, 120],
  gpuCoreOffset: [-500, 300],
  gpuMemOffset: [-1000, 2000],
  gpuFan: [0, 100],
} as const satisfies Record<keyof Tuning, readonly [number, number]>;

/** Clamp every provided tuning value into its safe range; drop non-numbers. */
export function clampTuning(t: Record<string, unknown>): Tuning {
  const out: Tuning = {};
  for (const [k, [lo, hi]] of Object.entries(TUNING_LIMITS) as [keyof Tuning, readonly [number, number]][]) {
    const v = Number(t[k]);
    if (t[k] === undefined || t[k] === "" || !Number.isFinite(v)) continue;
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

export const RIG_ONLINE_WINDOW_MS = 45_000;
export function isRigOnline(lastSeen: string | null, now = Date.now()): boolean {
  return !!lastSeen && now - new Date(lastSeen).getTime() < RIG_ONLINE_WINDOW_MS;
}

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
export function normaliseUsername(u: string): string {
  return u.trim().toLowerCase();
}
export function usernameEmail(u: string): string {
  return `${normaliseUsername(u)}@users.gydsminer.invalid`;
}
export function walletEmail(address: string): string {
  return `${address.toLowerCase()}@wallets.gydsminer.invalid`;
}
