// Public, read-only: returns the build id of the app currently being served.
// Contains no user data.
import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_ID } from "@/lib/app-version";
import { RIG_AGENT_VERSION } from "@/lib/rig-agent-version";

export const Route = createFileRoute("/api/public/app-version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { build: APP_BUILD_ID, rigAgentVersion: RIG_AGENT_VERSION },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
