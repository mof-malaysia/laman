import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: "Laman",
    favicon: "./src/assets/favicon.svg",
  },
  server: {
    // The server serves the built admin at /admin, so it lives there in development too.
    base: "/admin",
    // The server owns :3000; the API, canvas and docs are proxied, so the
    // browser sees one origin, as it does when the server serves this app.
    // The published site is at the server's own address in development.
    port: Number(process.env.ADMIN_PORT ?? 3001),
    proxy: [
      {
        // Agents (docs/mcp.md) connect to this address in development. The
        // server writes its OAuth endpoints and issuer from the Host it's
        // sent, so these keep this one: the consent screen is here, not on
        // the server's port. First, so /api/agents isn't taken by /api.
        pathFilter: [
          "/api/agents",
          "/mcp",
          "/oauth",
          "/.well-known/oauth-authorization-server",
          "/.well-known/oauth-protected-resource",
        ],
        target: process.env.SERVER_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      {
        pathFilter: [
          "/api",
          "/render",
          "/_astro",
          "/media",
          "/healthz",
          "/docs",
          "/openapi.json",
          // Site search, for the Search screen's "Try a search".
          "/pagefind",
          "/carian",
        ],
        // The server binds 127.0.0.1 by default; SERVER_URL points elsewhere.
        target: process.env.SERVER_URL ?? "http://127.0.0.1:3000",
      },
    ],
  },
});
