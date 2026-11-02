// The renderer is an internal Astro build, mounted by the server at /render.
// It turns a block tree (passed in `locals`) into HTML with the FTDS Astro
// components. It has no routes of its own beyond that.
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "middleware" }),
  // One stylesheet file per build, so the publisher can copy it and the
  // editor can swap blocks without new CSS.
  build: { inlineStylesheets: "never" },
  // The server is the only caller; it checks the request before handing over.
  security: { checkOrigin: false },
  vite: { plugins: [tailwindcss()] },
});
