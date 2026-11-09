import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENDPOINTS,
  DEFAULT_GYDS_RPC_ENDPOINTS,
  DEFAULT_GYDS_RPC_URL,
  normalizeRpcEndpointUrl,
} from "@/lib/mining/rpc-endpoints";
import { validateRpcUrl } from "@/lib/mining/url";

describe("GYDS RPC presets", () => {
  it("seeds the user-provided official mining endpoint", () => {
    expect(DEFAULT_GYDS_RPC_URL).toBe("https://netlifegy.com/api/mining/rpc");
    expect(DEFAULT_ENDPOINTS).toEqual(
      DEFAULT_GYDS_RPC_ENDPOINTS.map(({ label, url }) => ({ label, url })),
    );
    expect(() => validateRpcUrl(DEFAULT_GYDS_RPC_URL)).not.toThrow();
  });

  it("recognizes endpoint URLs with trailing slashes as the same preset", () => {
    expect(normalizeRpcEndpointUrl(`${DEFAULT_GYDS_RPC_URL}/`)).toBe(DEFAULT_GYDS_RPC_URL);
  });
});
