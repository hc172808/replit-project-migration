// Rig access tokens: shown once when a rig is added, stored only as a SHA-256 hash.
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newRigToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "rig_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
