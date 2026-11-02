/**
 * How publishing holds up on a large listing: seeds a throwaway site with a
 * listing of N entries (5,000 by default), then times a full publish, a
 * publish after editing one entry, and one after adding an entry.
 *
 *   pnpm --filter @fiscal-sb/server scale [entries]
 *
 * Nothing touches DATA_DIR: the site lives in a temporary folder that is
 * removed at the end.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { createEntry } from "../src/content/entries.js";
import { publishPages } from "../src/content/pages.js";
import { loadEnv } from "../src/env.js";
import { publishSite } from "../src/publisher.js";

const count = Number(process.argv[2] ?? 5000);
const dataDir = await mkdtemp(join(tmpdir(), "site-builder-scale-"));
const app = await buildApp({
  env: loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
    SITE_URL: "https://agensi.gov.my",
  }),
  databasePath: ":memory:",
  runJobs: false,
});
const call = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
  (await app.inject({ method, url, ...(payload ? { payload } : {}) })).json().data;

async function timed(label: string, run: () => Promise<{ counts: Record<string, number> }>) {
  const start = performance.now();
  const { counts } = await run();
  const seconds = ((performance.now() - start) / 1000).toFixed(2);
  console.warn(
    `${label.padEnd(24)} ${seconds.padStart(7)} s   ${counts.written} written, ${counts.unchanged} unchanged`,
  );
}

try {
  console.warn(`Seeding a listing with ${count} entries…`);
  const listing = await call("POST", "/api/pages", {
    title: "Berita",
    slug: "berita",
    template: "berita",
  });
  // Straight through the content functions: publishing through the API would
  // queue a rebuild per entry.
  const ids: string[] = [];
  for (let n = 1; n <= count; n++)
    ids.push((await createEntry(app.db, listing.id, `Notis ${n}`)).id);
  const home = (await call("GET", "/api/pages"))[0];
  await publishPages(app.db, [...ids, listing.id, home.id]);

  const publish = () => publishSite({ db: app.db, dataDir, siteUrl: "https://agensi.gov.my" });
  await timed("Full publish", () =>
    publishSite({ db: app.db, dataDir, siteUrl: "https://agensi.gov.my", full: true }),
  );
  await timed("Nothing changed", publish);

  const oldest = ids[0] ?? "";
  const { draft } = await call("GET", `/api/pages/${oldest}`);
  await call("PUT", `/api/pages/${oldest}/draft`, {
    draft: { ...draft, ms: { ...draft.ms, title: `${draft.ms.title} (dikemas kini)` } },
  });
  await publishPages(app.db, [oldest]);
  await timed("One entry edited", publish);

  await publishPages(app.db, [(await createEntry(app.db, listing.id, "Notis baharu")).id]);
  await timed("One entry added", publish);
} finally {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
