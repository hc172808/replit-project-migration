// Validates a GYDS RPC endpoint URL before the server calls it.
// Same messages as the original miner, plus a block on private/local
// addresses because the call now runs on shared hosting.

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
];

export function validateRpcUrl(url: string): void {
  if (!url) throw new Error("No URL provided.");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error(`Protocol "${u.protocol.replace(":", "")}://" is not supported. Use HTTP or HTTPS.`);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80") ||
    PRIVATE_V4.some((r) => r.test(host))
  ) {
    throw new Error(`"${host}" is a private or local address. Use a public node URL.`);
  }
}
