/**
 * The bridge to the renderer (apps/renderer): an Astro build in middleware
 * mode. `renderHtml` drives its Node handler in memory with light-my-request,
 * the same way Fastify's `inject` does, so the canvas, preview and publisher
 * all get HTML from the one renderer without a network hop.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RenderInput } from "@fiscal-sb/blocks";
import { handler } from "@fiscal-sb/renderer";
import { clientDir } from "@fiscal-sb/renderer/paths";
import inject from "light-my-request";
import { filesIn } from "./manifest.js";

/** The renderer's browser assets (CSS, fonts, component scripts), served at /_astro. */
export const rendererClientDir = clientDir;

let build: Promise<string> | undefined;

/**
 * A fingerprint of the built renderer (its server code and browser assets).
 * It changes when a block wrapper, FTDS or Astro changes, so every page is
 * rendered again; it's read once per process.
 */
export function rendererBuild(): Promise<string> {
  build ??= (async () => {
    const dist = join(clientDir, "..");
    const hash = createHash("sha256");
    for (const file of await filesIn(dist))
      hash.update(file).update(await readFile(join(dist, file)));
    return hash.digest("base64url");
  })();
  return build;
}

export class RenderError extends Error {}

export async function renderHtml(input: RenderInput): Promise<string> {
  const response = await inject(
    (req, res) => {
      void handler(
        req,
        res,
        () => {
          res.statusCode = 404;
          res.end();
        },
        { render: input },
      );
    },
    // The renderer's only route; the page itself travels in `locals`.
    { method: "GET", url: "/render/page", headers: { host: "renderer.internal" } },
  );
  if (response.statusCode !== 200)
    throw new RenderError(`Renderer answered ${response.statusCode} for ${input.path}`);
  return response.payload;
}
