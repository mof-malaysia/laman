/**
 * Saves a release's databases for the upgrade tests (docs/upgrades.md § CI):
 * builds a throwaway site that uses everything, through the API, checks that
 * every kind of stored document is in it, then writes it as a SQL dump to
 * test/fixtures/<last migration>.sql, which every later build must boot and
 * publish, and its analytics as analytics-<last migration>.sql, which every
 * later build must open and report on. A file already saved is left alone.
 *
 *   pnpm --filter @fiscal-sb/server fixture
 *
 * Run it once per release, from that release's build: a saved database is
 * never made again or edited. Needs the sqlite3 command. Nothing touches
 * DATA_DIR.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  blocksFor,
  isOpening,
  newBlock,
  type PageDocument,
  type PageKind,
  type TemplateId,
  templateIds,
  templatesFor,
} from "@fiscal-sb/blocks";
import { sql } from "kysely";
import sharp from "sharp";
import { storedDocuments } from "../src/db/documents.js";
import { migrations } from "../src/db/migrations.js";
import { loadEnv } from "../src/env.js";
import { multipartFile, myt, sessionCookie, signedInApp } from "../test/helpers.js";

const release = Object.keys(migrations).toSorted().at(-1)!;
const fixtures = join(import.meta.dirname, "..", "test", "fixtures");
const siteFile = join(fixtures, `${release}.sql`);
const analyticsFile = join(fixtures, `analytics-${release}.sql`);
if (existsSync(siteFile) && existsSync(analyticsFile)) {
  console.error(
    `${release}'s databases are already saved, and saved databases are never made again.`,
  );
  process.exit(1);
}
/** A browser's user agent, so the visits below aren't taken for a bot's. */
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Every block `kind` may use, with only its first opening block (a page has one h1). */
const everyBlock = (kind: PageKind) =>
  blocksFor(kind)
    .filter((type, i, list) => !isOpening(type) || list.findIndex(isOpening) === i)
    .map((type) => newBlock(type));

const dataDir = await mkdtemp(join(tmpdir(), "laman-fixture-"));
const databasePath = join(dataDir, "site.db");
try {
  const app = await signedInApp({
    env: loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATA_DIR: dataDir,
      ADMIN_DIST: join(dataDir, "none"),
    }),
    databasePath,
    // Jobs stay queued, so the fixture has unfinished jobs whose payloads must still parse.
    runJobs: false,
  });
  try {
    async function call<T = Record<string, unknown>>(
      method: "GET" | "POST" | "PUT" | "DELETE",
      url: string,
      payload?: object,
    ) {
      const response = await app.inject({ method, url, ...(payload && { payload }) });
      if (response.statusCode >= 400)
        throw new Error(`${method} ${url}: ${response.statusCode} ${response.body}`);
      // A 204 (a delete, say) has no body.
      return (response.body ? (response.json() as { data: T }).data : undefined) as T;
    }
    const publish = (id: string) => call("POST", `/api/pages/${id}/publish`);
    /** Saves `id`'s draft as `edit` changes it. */
    const change = async (id: string, edit: (draft: PageDocument) => PageDocument) => {
      const { draft } = await call<{ draft: PageDocument }>("GET", `/api/pages/${id}`);
      await call("PUT", `/api/pages/${id}/draft`, { draft: edit(draft) });
    };
    const retitle = (id: string, suffix: string) =>
      change(id, (d) => ({ ...d, ms: { ...d.ms, title: `${d.ms.title} ${suffix}` } }));
    /**
     * A site document with a previous, a live and a draft copy that differ:
     * each of `versions` is saved in turn, and all but the last published.
     */
    async function history<T>(name: string, versions: ((draft: T) => unknown)[]) {
      const { draft } = await call<{ draft: T }>("GET", `/api/${name}`);
      for (const [i, version] of versions.entries()) {
        await call("PUT", `/api/${name}`, { draft: version(draft) });
        if (i < versions.length - 1) await call("POST", `/api/${name}/publish`);
      }
    }

    const [home] = await call<{ id: string }[]>("GET", "/api/pages");

    // Every template, published, then edited again.
    const made = {} as Record<TemplateId, string>;
    for (const template of templateIds) {
      const { id } = await call<{ id: string }>("POST", "/api/pages", {
        title: `Templat ${template}`,
        slug: `templat-${template}`.toLowerCase(),
        template,
      });
      made[template] = id;
      await publish(id);
      await retitle(id, "(draf)");
    }

    // Every block a page can hold, with its default content.
    const all = await call<{ id: string }>("POST", "/api/pages", {
      title: "Semua blok",
      slug: "semua-blok",
    });
    await change(all.id, (d) => ({ ...d, ms: { ...d.ms, blocks: everyBlock("page") } }));
    await publish(all.id);

    // A listing's entries: pinned, with every entry block, and one scheduled in Malaysian time.
    const news = made[templatesFor("listing")[0]!];
    const entry = async (title: string, fields: Partial<NonNullable<PageDocument["entry"]>>) => {
      const { id } = await call<{ id: string }>("POST", `/api/pages/${news}/entries`, { title });
      await change(id, (d) => ({
        ...d,
        entry: { ...d.entry!, ...fields },
        ms: { ...d.ms, blocks: everyBlock("entry") },
      }));
      return id;
    };
    const pinned = await entry("Notis penting", { pinned: true, summary: "Ringkasan notis." });
    const later = await entry("Notis akan datang", { publishAt: myt(48) });
    for (const id of [pinned, later, news]) await publish(id);

    // History: a page saved several times; one moved (with a redirect) and one deleted.
    for (const n of [1, 2, 3]) await retitle(home!.id, `semakan ${n}`);
    await publish(home!.id);
    await call("POST", `/api/pages/${made[templateIds[0]]}/move`, {
      slug: "alamat-baharu",
      redirect: true,
    });
    const gone = await call<{ id: string }>("POST", "/api/pages", { title: "Lama", slug: "lama" });
    await call("DELETE", `/api/pages/${gone.id}`);

    // Every site document.
    type Settings = { identity: { siteName: string } };
    await history<Settings>(
      "settings",
      ["(lama)", "", "(draf)"].map((suffix) => (d) => ({
        ...d,
        identity: { ...d.identity, siteName: `Laman Web Agensi ${suffix}`.trim() },
      })),
    );
    await history<object>(
      "announcement",
      ["Pejabat ditutup.", "Pejabat dibuka semula.", "Notis baharu."].map((message) => (d) => ({
        ...d,
        on: true,
        message,
        from: myt(1),
        until: myt(72),
      })),
    );
    await history<object>(
      "search",
      ["borang", "lesen", "permohonan"].map((term, i) => (d) => ({
        ...d,
        filters: i === 1,
        pins: [{ terms: [term], pageId: all.id }],
      })),
    );
    await history<{ navbar: unknown[] }>(
      "navigation",
      [2, 3, undefined].map((items) => (d) => ({ ...d, navbar: d.navbar.slice(0, items) })),
    );
    await history(
      "theme",
      ["green", "teal", "navy"].map((preset) => () => ({ preset })),
    );
    await call("PUT", "/api/security", { requireTwoFactor: false });

    // People, a file waiting for its variants, a site publish scheduled for later, a backup.
    await sessionCookie(app, "editor");
    await call("POST", "/api/users/invites", { role: "editor", note: "Pegawai baharu" });
    const png = await sharp({
      create: { width: 640, height: 400, channels: 3, background: "#0b6b3a" },
    })
      .png()
      .toBuffer();
    const upload = await app.inject({
      method: "POST",
      url: "/api/media",
      ...multipartFile("logo.png", png),
    });
    if (upload.statusCode !== 201) throw new Error(`Upload failed: ${upload.body}`);
    await call("POST", "/api/publish", { runAt: myt(24) });
    await call("POST", "/api/backups");

    // An agent that registered itself, and an API token for the listing's entries and media.
    const agent = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: { client_name: "Fixture agent", redirect_uris: ["http://127.0.0.1:33418/callback"] },
    });
    if (agent.statusCode >= 400) throw new Error(`Registering an agent failed: ${agent.body}`);
    await call("POST", "/api/tokens", {
      name: "Fixture sync",
      role: "contentManager",
      areas: ["entries", "media"],
      listingIds: [news],
      days: 365,
    });

    // Visits, so the analytics database has some to carry across upgrades.
    for (const [n, path] of ["/", "/semua-blok", "/semua-blok"].entries())
      await app.inject({
        method: "POST",
        url: "/_v",
        headers: { origin: "http://localhost", "user-agent": BROWSER },
        payload: { type: "view", id: `fixtureview${n}`, path },
      });

    // Every kind of stored document is here, so the next build is tested against all of them.
    for (const doc of storedDocuments) {
      const { rows } = await sql<{ n: number }>`
        select count(*) as n from ${sql.table(doc.table)} where ${doc.where ?? sql`1 = 1`}
      `.execute(app.db);
      if (!rows[0]?.n) throw new Error(`The fixture has no ${doc.name}: add some above.`);
    }
  } finally {
    await app.close();
  }
  // Closing the app wrote the collector's queue to analytics.db.
  for (const [file, database] of [
    [siteFile, databasePath],
    [analyticsFile, join(dataDir, "analytics.db")],
  ] as const) {
    if (existsSync(file)) continue;
    await writeFile(file, execFileSync("sqlite3", [database, ".dump"], { encoding: "utf8" }));
    console.warn(`Saved ${file}`);
  }
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
