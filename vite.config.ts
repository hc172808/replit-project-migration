// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// One id per build, baked into both the browser bundle and the server. The
// dashboard compares its own id with /api/public/app-version to spot new releases.
const APP_BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default defineConfig({
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: "0.0.0.0",
      port: 5000,
      strictPort: true,
      allowedHosts: true,
      watch: { ignored: ["**/.local/**", "**/.agents/**", "**/.cache/**"] },
    },
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
    define: { __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID) },
  },
});
