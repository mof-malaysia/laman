// The Laman marketing site: a static Astro build of the FTDS Astro components,
// deployed to GitHub Pages (.github/workflows/www.yml). BM is at /, English at /en.
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import { copyFile, mkdir } from "node:fs/promises";
import { defineConfig } from "astro/config";
import { withBase } from "./src/rehype-base.mjs";

// GitHub Pages serves the project at /laman until there's a custom domain.
// SITE_BASE="/" builds for the root (a custom domain, or `pnpm dev`).
const base = process.env.SITE_BASE ?? "/";

/**
 * The English home is en.html beside the en/ folder. GitHub Pages may answer
 * /en with a redirect to the folder, so the folder gets the same page too.
 */
const englishHomeInFolder = {
  name: "english-home-in-folder",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      await mkdir(new URL("en/", dir), { recursive: true });
      await copyFile(new URL("en.html", dir), new URL("en/index.html", dir));
    },
  },
};

export default defineConfig({
  site: process.env.SITE_URL ?? "https://mof-malaysia.github.io",
  base,
  output: "static",
  // kedaulatan.html, served at /kedaulatan: addresses have no trailing slash, as on Laman sites.
  build: { format: "file" },
  trailingSlash: "never",
  i18n: {
    locales: ["ms", "en"],
    defaultLocale: "ms",
    routing: { prefixDefaultLocale: false },
  },
  // Links in the copy are written from the site root ("/pasang"); this puts the base in front.
  markdown: { processor: unified({ rehypePlugins: [[withBase, { base }]] }) },
  integrations: [englishHomeInFolder],
  vite: { plugins: [tailwindcss()] },
});
