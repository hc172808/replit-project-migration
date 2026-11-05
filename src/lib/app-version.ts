// Build id baked in at build time (see vite.config.ts). Falls back to "dev" when
// the define is missing (e.g. unit tests).
declare const __APP_BUILD_ID__: string | undefined;
export const APP_BUILD_ID: string = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";

/** A newer app is live when the server reports a different, real build id. */
export function hasNewAppVersion(mine: string, live: string | null | undefined): boolean {
  return !!live && live !== "dev" && mine !== "dev" && live !== mine;
}
