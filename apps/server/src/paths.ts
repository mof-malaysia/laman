/**
 * The builder's address space, in one place: what the server answers itself
 * rather than the published site's files, which of it needs a session, and
 * which gets the builder's strict script policy. The admin's dev proxy
 * (apps/admin/rsbuild.config.ts) forwards the same paths.
 */

/** "/name" or "/name/…" for any of `names`. */
const under = (names: string[]) =>
  new RegExp(`^/(${names.map((n) => n.replaceAll(".", "\\.")).join("|")})(/|$)`);

/** The API reference (Scalar) and the document it reads. */
const docs = ["docs", "openapi.json"];
/** Behind a session: the API, the canvas, the media library and the API reference. */
const signedIn = ["api", "render", "media", ...docs];

/** Builder paths that need a session; everything else is the published site. */
export const guardedPath = under(signedIn);
/** The builder: the admin, and everything behind a session. */
export const builderPath = under(["admin", ...signedIn]);
/** The API reference, which runs an inline script of its own. */
export const docsPath = under(docs);
/** Paths the server answers itself; everything else is a file of the published site. */
export const ownPath = under(["admin", "_astro", "healthz", "_v", ...signedIn]);

/** The path as the router reads it: "/%61pi" is "/api". Undecodable paths stay as they are. */
export function decodedPath(url: string) {
  const path = url.split("?")[0] ?? "/";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
