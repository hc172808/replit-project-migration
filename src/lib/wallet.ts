// Browser-side web3 wallet access: injected wallets (MetaMask, Brave,
// Coinbase extension…) and WalletConnect for phone wallets. Browser only —
// call from event handlers.

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export type WalletKind = "injected" | "walletconnect";

function utf8ToHex(s: string) {
  return "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { ethereum?: Eip1193 }).ethereum;
}

export async function connectWallet(kind: WalletKind): Promise<{ address: string; sign: (msg: string) => Promise<string>; disconnect: () => Promise<void> }> {
  let provider: Eip1193;
  let disconnect = async () => {};
  if (kind === "injected") {
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!eth) throw new Error("No browser wallet found. Install MetaMask, or use WalletConnect for a phone wallet.");
    provider = eth;
  } else {
    // WalletConnect project IDs are public (they ship in every browser bundle).
    // Self-hosters can override it with VITE_WALLETCONNECT_PROJECT_ID.
    const projectId =
      (import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] as string | undefined) || "65dec6ded0da57edf6cc218ffd48462d";
    const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
    const wc = await EthereumProvider.init({
      projectId,
      chains: [1],
      showQrModal: true,
      metadata: {
        name: "GYDS Miner",
        description: "Sign in to your mining dashboard",
        url: window.location.origin,
        icons: [`${window.location.origin}/icon-512.png`],
      },
    });
    await wc.connect();
    provider = wc as unknown as Eip1193;
    disconnect = () => wc.disconnect();
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet account selected.");
  return {
    address,
    disconnect,
    sign: async (msg: string) =>
      (await provider.request({ method: "personal_sign", params: [utf8ToHex(msg), address] })) as string,
  };
}
