// Checks the built site (dist/) the way GitHub Pages will serve it: every
// internal link and image resolves to a file, and every page has one h1.
// Run after `astro build`; it's this package's test.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = join(import.meta.dirname, "..", "dist");
if (!existsSync(dist)) throw new Error("Build the site first: dist/ is missing.");
const base = (process.env.SITE_BASE ?? "/").replace(/\/$/, "");

const pages = readdirSync(dist, { recursive: true })
  .filter((name) => String(name).endsWith(".html"))
  .map((name) => join(dist, String(name)));

/** Where GitHub Pages finds `/a/b`: a/b, a/b.html or a/b/index.html. */
const resolves = (address) => {
  const path = decodeURI(address.split(/[?#]/)[0]).slice(base.length) || "/";
  const file = join(dist, path);
  return [file, `${file}.html`, join(file, "index.html")].some(
    (f) => existsSync(f) && statSync(f).isFile(),
  );
};

const problems = [];
for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const name = relative(dist, page);
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) problems.push(`${name}: ${h1s} h1 elements`);
  for (const [, address] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (!address.startsWith("/") || address.startsWith("//")) continue;
    if (!resolves(address)) problems.push(`${name}: ${address} doesn't exist`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${pages.length} pages: every internal link resolves, one h1 each.`);
