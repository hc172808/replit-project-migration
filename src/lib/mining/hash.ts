// Pure GYDS hashing rules, shared by the browser mining threads and tests.
// Mirrors the original worker.js exactly:
//   hash = sha256_hex(`${prevBlockHash}${minerAddress}${nonceDecimal}`)
//   a share is found when BigInt(hash) < BigInt(target)
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function computeHash(prevHash: string, address: string, nonce: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${prevHash}${address}${nonce}`)));
}

/** Left-pads a hex target to 64 chars so it can be compared as a string. */
export function normaliseTarget(target: string): string {
  const t = target.toLowerCase().replace(/^0x/, "");
  if (t.length > 64) return "f".repeat(64); // larger than any sha256 → every hash qualifies
  return t.padStart(64, "0");
}

/**
 * Equivalent to BigInt('0x' + hash) < BigInt('0x' + target) for a 64-char
 * lowercase hash and a normalised 64-char target, without BigInt cost.
 */
export function meetsTarget(hash: string, normalisedTarget: string): boolean {
  return hash < normalisedTarget;
}
