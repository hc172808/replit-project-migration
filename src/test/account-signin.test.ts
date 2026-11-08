import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { normaliseUsername, usernameEmail, walletEmail } from "@/lib/assets";

const mocks = vi.hoisted(() => ({ from: vi.fn(), createUser: vi.fn(), generateLink: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate = (data: unknown) => data;
  const chain = { middleware: () => chain, inputValidator: (fn: typeof validate) => { validate = fn; return chain; },
    handler: (fn: (input: unknown) => unknown) => (input: { data: unknown }) => fn({ data: validate(input.data) }) };
  return chain;
} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => "miner.example" }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: mocks.from, auth: { admin: { createUser: mocks.createUser, generateLink: mocks.generateLink } },
} }));
import { buildSignInMessage, registerUsername, signInWithWallet } from "@/lib/account.functions";

describe("username accounts", () => {
  beforeEach(() => vi.clearAllMocks());
  it("normalizes username login to the same internal credential", () => {
    expect(normaliseUsername(" Ken_123 ")).toBe("ken_123");
    expect(usernameEmail(" Ken_123 ")).toBe("ken_123@users.gydsminer.invalid");
  });
  it("registers a username without requesting an email", async () => {
    const lookup = { eq: vi.fn().mockReturnValue({ maybeSingle: async () => ({ data: null }) }) };
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ select: () => lookup, insert });
    mocks.createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    expect(await registerUsername({ data: { username: "Ken_123", password: "test-password" } })).toEqual({ ok: true });
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "ken_123@users.gydsminer.invalid", password: "test-password" }));
    expect(insert).toHaveBeenCalledWith({ id: "user-1", username: "ken_123" });
  });
  it("rejects an invalid username before creating an account", async () => {
    expect(await registerUsername({ data: { username: "bad name", password: "test-password" } })).toMatchObject({ ok: false });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("wallet sign-in", () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const nonce = "a".repeat(32);
  const issuedAt = "2026-11-08T04:00:00.000Z";
  const message = buildSignInMessage("miner.example", account.address, nonce, issuedAt);
  let used = false;
  beforeEach(() => {
    vi.clearAllMocks(); used = false;
    mocks.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain, eq: () => chain, gt: () => chain,
        maybeSingle: async () => table === "auth_nonces"
          ? { data: { nonce, address: account.address.toLowerCase(), used, created_at: issuedAt, expires_at: "2099-01-01T00:00:00Z" } }
          : { data: null },
        update: () => {
          const consumed = { select: () => consumed, eq: () => consumed, gt: () => consumed,
            maybeSingle: async () => { const data = used ? null : { nonce }; used = true; return { data, error: null }; } };
          return consumed;
        },
        insert: async () => ({ error: null }),
      };
      return chain;
    });
    mocks.createUser.mockResolvedValue({ data: { user: { id: "wallet-1" } }, error: null });
    mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "test-token" } }, error: null });
  });
  it("verifies a real signature and refuses replay", async () => {
    const signature = await account.signMessage({ message });
    const data = { address: account.address, message, signature };
    expect(await signInWithWallet({ data })).toEqual({ ok: true, tokenHash: "test-token" });
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: walletEmail(account.address) }));
    expect(await signInWithWallet({ data })).toMatchObject({ ok: false });
  });
  it("rejects another wallet's signature without consuming the challenge", async () => {
    const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
    expect(await signInWithWallet({ data: { address: account.address, message, signature: await other.signMessage({ message }) } })).toMatchObject({ ok: false });
    expect(used).toBe(false);
  });
  it("rejects a signed message for another domain", async () => {
    const foreign = buildSignInMessage("attacker.example", account.address, nonce, issuedAt);
    expect(await signInWithWallet({ data: { address: account.address, message: foreign, signature: await account.signMessage({ message: foreign }) } })).toMatchObject({ ok: false });
    expect(used).toBe(false);
  });
});