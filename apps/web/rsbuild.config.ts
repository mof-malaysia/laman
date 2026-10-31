import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { THEME_KEY } from "./src/theme";

// Applies the saved (or OS) theme before first paint, so a dark-mode visitor
// never sees a light flash.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.add(t)}catch(e){}`;

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: "Fiscal Sb",
    tags: [{ tag: "script", head: true, append: false, children: themeScript }],
  },
  server: {
    // The api dev server owns :3000. Everything it serves is proxied, so the
    // browser sees one origin, as it does in the Docker image.
    port: 3001,
    proxy: [
      {
        context: ["/v1", "/healthz", "/docs", "/openapi.json"],
        target: "http://localhost:3000",
      },
    ],
  },
});
