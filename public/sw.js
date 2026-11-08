// Online-only shell: never cache authenticated pages, RPC calls or credentials.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => new Response(
      "GYDS Miner needs an internet connection. Reconnect and reload to access your rigs.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    )));
  }
});