// Account server functions: username + password registration and web3
// wallet sign-in (Sign-In with Ethereum style message). No email is used;
// accounts get an internal placeholder address that never receives mail.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { verifyMessage } from "viem";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { USERNAME_RE, normaliseUsername, usernameEmail, walletEmail } from "@/lib/assets";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function randomPassword() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function requestHost() {
  return (getRequestHeader("x-forwarded-host") || getRequestHeader("host") || "gydsminer.app").split(",")[0]?.trim() || "gydsminer.app";
}

export function buildSignInMessage(host: string, address: string, nonce: string, issuedAt: string) {
  return [
    `${host} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to GYDS Miner. This does not cost anything or send a transaction.",
    "",
    `URI: https://${host}`,
    "Version: 1",
    "Chain ID: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export const registerUsername = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ username: z.string().min(3).max(24), password: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const username = normaliseUsername(data.username);
    if (!USERNAME_RE.test(username))
      return { ok: false as const, error: "Username: 3–24 lowercase letters, numbers or _." };
    const sb = await admin();
    const { data: taken } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) return { ok: false as const, error: "That username is taken." };

    const { data: created, error } = await sb.auth.admin.createUser({
      email: usernameEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error || !created.user) {
      console.error("registerUsername", error);
      return { ok: false as const, error: error?.message?.includes("already") ? "That username is taken." : "Could not create the account." };
    }
    const { error: pErr } = await sb.from("profiles").insert({ id: created.user.id, username });
    if (pErr) {
      await sb.auth.admin.deleteUser(created.user.id);
      return { ok: false as const, error: "That username is taken." };
    }
    return { ok: true as const };
  });

export const getWalletChallenge = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ address: z.string().regex(ADDRESS_RE) }).parse(input))
  .handler(async ({ data }) => {
    const host = requestHost();
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const issuedAt = new Date().toISOString();
    const sb = await admin();
    const { error } = await sb.from("auth_nonces").insert({
      nonce,
      address: data.address.toLowerCase(),
      created_at: issuedAt,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    if (error) throw new Error("Could not start wallet sign-in.");
    return { message: buildSignInMessage(host, data.address, nonce, issuedAt) };
  });

async function checkSignature(message: string, signature: string, address: string) {
  const nonce = /Nonce: ([0-9a-f]{32})/.exec(message)?.[1];
  if (!nonce || !message.includes(`\n${address}\n`)) return "Invalid sign-in message.";
  const sb = await admin();
  const { data: row } = await sb.from("auth_nonces").select("*").eq("nonce", nonce).maybeSingle();
  if (!row || row.used || row.address !== address.toLowerCase() || new Date(row.expires_at).getTime() < Date.now())
    return "This sign-in request expired. Try again.";
  const issuedAt = /Issued At: (.+)$/.exec(message)?.[1];
  if (!issuedAt || new Date(issuedAt).getTime() !== new Date(row.created_at).getTime() || message !== buildSignInMessage(requestHost(), address, nonce, issuedAt))
    return "Invalid sign-in message.";
  const ok = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!ok) return "Signature does not match this wallet.";
  // Only one concurrent request may consume a valid challenge.
  const { data: consumed, error } = await sb.from("auth_nonces").update({ used: true })
    .eq("nonce", nonce).eq("used", false).gt("expires_at", new Date().toISOString()).select("nonce").maybeSingle();
  return !error && consumed ? null : "This sign-in request expired. Try again.";
}

const sigInput = z.object({
  address: z.string().regex(ADDRESS_RE),
  message: z.string().max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(1000),
});

export const signInWithWallet = createServerFn({ method: "POST" })
  .inputValidator((input) => sigInput.parse(input))
  .handler(async ({ data }) => {
    const bad = await checkSignature(data.message, data.signature, data.address);
    if (bad) return { ok: false as const, error: bad };
    const address = data.address.toLowerCase();
    const sb = await admin();

    const { data: profile } = await sb.from("profiles").select("id").eq("wallet_address", address).maybeSingle();
    let email: string;
    if (profile) {
      const { data: u, error } = await sb.auth.admin.getUserById(profile.id);
      if (error || !u.user?.email) return { ok: false as const, error: "Account not found." };
      email = u.user.email;
    } else {
      email = walletEmail(address);
      const { data: created, error } = await sb.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { wallet_address: address },
      });
      if (error || !created.user) {
        console.error("signInWithWallet create", error);
        return { ok: false as const, error: "Could not create the account." };
      }
      const { error: pErr } = await sb.from("profiles").insert({ id: created.user.id, wallet_address: address });
      if (pErr) {
        await sb.auth.admin.deleteUser(created.user.id);
        return { ok: false as const, error: "Could not create the account." };
      }
    }
    const { data: link, error: lErr } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    if (lErr || !link.properties?.hashed_token) {
      console.error("signInWithWallet link", lErr);
      return { ok: false as const, error: "Could not sign in." };
    }
    return { ok: true as const, tokenHash: link.properties.hashed_token };
  });

export const linkWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sigInput.parse(input))
  .handler(async ({ data, context }) => {
    const bad = await checkSignature(data.message, data.signature, data.address);
    if (bad) return { ok: false as const, error: bad };
    const sb = await admin();
    const address = data.address.toLowerCase();
    const { data: other } = await sb.from("profiles").select("id").eq("wallet_address", address).maybeSingle();
    if (other && other.id !== context.userId) return { ok: false as const, error: "That wallet is linked to another account." };
    const { error } = await sb.from("profiles").upsert({ id: context.userId, wallet_address: address });
    if (error) return { ok: false as const, error: "Could not link wallet." };
    return { ok: true as const };
  });
