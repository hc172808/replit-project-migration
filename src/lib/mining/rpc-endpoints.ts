export const DEFAULT_GYDS_RPC_ENDPOINTS = [
  {
    label: "GYDS official RPC",
    url: "https://netlifegy.com/api/mining/rpc",
    requiresCloudflareAccess: true,
  },
] as const;

export const DEFAULT_GYDS_RPC_URL = DEFAULT_GYDS_RPC_ENDPOINTS[0].url;

export const DEFAULT_ENDPOINTS = DEFAULT_GYDS_RPC_ENDPOINTS.map(({ label, url }) => ({
  label,
  url,
}));

export function normalizeRpcEndpointUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}
