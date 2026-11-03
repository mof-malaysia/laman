/**
 * Security headers on every response: the builder (admin, API, canvas,
 * media library, docs) and the published site get what suits each.
 *
 * SVG is the one file type that can carry script, and the builder serves it
 * from its own origin (the media library, and the published copies), so any
 * SVG response is sandboxed: opened directly, nothing in it runs.
 */
import type { FastifyInstance } from "fastify";
import { builderPath, decodedPath, docsPath } from "./paths.js";

const svgPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
/** No plugins, no <base> rewriting, and only the builder may frame itself (the canvas). */
const framing = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";
/**
 * The admin, the canvas and the previews shown in it: scripts only from the
 * builder's own files, never inline or from eval, so a script that got into
 * content can't run with an officer's session. WebAssembly is allowed for the
 * search preview's Pagefind. Styles may be inline: React sets style
 * attributes, and the canvas carries the site's colours and the editor's overlay.
 */
const builderPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  framing,
].join("; ");
/** The API reference (Scalar) runs an inline script of its own: only the framing rules. */
const docsPolicy = framing;
const sitePolicy = "base-uri 'self'; object-src 'none'";

/** The policy for a response: SVG anywhere is sandboxed; then by where it is. */
function policyFor(path: string, type: string) {
  if (type.startsWith("image/svg+xml")) return svgPolicy;
  if (docsPath.test(path)) return docsPolicy;
  return builderPath.test(path) ? builderPolicy : sitePolicy;
}

export function useSecurityHeaders(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply) => {
    // As the guard reads it, so no spelling of a builder path gets the site's policy.
    const path = decodedPath(request.url);
    const builder = builderPath.test(path);
    reply.header("x-content-type-options", "nosniff");
    reply.header(
      "content-security-policy",
      policyFor(path, String(reply.getHeader("content-type") ?? "")),
    );
    reply.header("referrer-policy", builder ? "same-origin" : "strict-origin-when-cross-origin");
    if (builder) reply.header("x-frame-options", "SAMEORIGIN");
    // Only over HTTPS, so a plain-HTTP test install doesn't pin itself.
    if (request.protocol === "https") reply.header("strict-transport-security", "max-age=31536000");
  });
}
