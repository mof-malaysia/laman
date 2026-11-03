import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import { sql, type Kysely } from "kysely";
import { z } from "zod";
import {
  checkStoredDocuments,
  parseStored,
  rewriteDocuments,
  storedDocuments,
} from "../src/db/documents.js";
import { executedMigrations, openDatabase, openSqlite } from "../src/db/index.js";
import { beforeBaseline, migrate, migrations } from "../src/db/migrations.js";
import { publishSite } from "../src/publisher.js";
import { openAnalyticsDatabase } from "../src/analytics/db.js";
import { since, summary } from "../src/analytics/reports.js";

let dir: string;
let path: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "site-builder-upgrade-"));
  path = join(dir, "site.db");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

/** The next build's migrations: this one's, and one more. */
const next = { ...migrations, "0002_next": { up: async () => {} } };

const addPage = (db: Kysely<unknown>, draft: unknown) =>
  sql`insert into pages (id, parent_id, slug, position, draft, created_at, updated_at)
    values (${randomUUID()}, null, ${randomUUID()}, 0, ${JSON.stringify(draft)}, '', '')`.execute(
    db,
  );

/** A site.db this build left, with `drafts` as pages, for the next build to upgrade. */
async function oldDatabase(drafts: unknown[]) {
  const { db } = openSqlite<unknown>(path);
  await migrate(db, migrations);
  for (const draft of drafts) await addPage(db, draft);
  await db.destroy();
  return readFileSync(path);
}

const valid = { ms: { title: "Utama", blocks: [] } };
const invalid = { ms: { title: "Utama", blocks: [{ id: "a", type: "noSuchBlock", props: {} }] } };

describe("upgrading site.db", () => {
  it("keeps a snapshot of the database from before the upgrade", async () => {
    await oldDatabase([valid]);
    const db = await openDatabase(path, next);
    await db.destroy();
    expect(readdirSync(join(dir, "upgrade"))).toEqual(["site-0001_baseline-to-0002_next.db"]);
  });

  it("refuses content that fails its schema, and puts the database back as it was", async () => {
    const original = await oldDatabase([valid, invalid]);
    const error = await openDatabase(path, next).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toMatch(/put back as it was \(at migration 0001_baseline\)/);
    expect(error?.message).toMatch(/1 stored documents don't match/);
    expect(error?.message).toMatch(/page drafts .*: ms\.blocks\.0/);
    expect(readFileSync(path).equals(original)).toBe(true);
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(readdirSync(join(dir, "upgrade"))).toEqual([]);
  });

  it("takes on a database a development build made before the baseline", async () => {
    await oldDatabase([valid]);
    const { db } = openSqlite<unknown>(path);
    await sql`delete from kysely_migration`.execute(db);
    for (const name of beforeBaseline)
      await sql`insert into kysely_migration (name, timestamp) values (${name}, '')`.execute(db);
    await db.destroy();
    const adopted = (await openDatabase(path)) as Kysely<unknown>;
    expect(await executedMigrations(adopted)).toEqual(["0001_baseline"]);
    const { rows } = await sql<{ n: number }>`select count(*) as n from pages`.execute(adopted);
    expect(rows[0]?.n).toBe(1);
    await adopted.destroy();
  });

  it("refuses one a development build stopped partway before the baseline", async () => {
    const { db } = openSqlite<unknown>(path);
    await migrate(db, migrations);
    await sql`delete from kysely_migration`.execute(db);
    await sql`insert into kysely_migration (name, timestamp) values ('0001_pages', '')`.execute(db);
    await db.destroy();
    await expect(openDatabase(path)).rejects.toThrow(/development build from before 1\.0/);
  });

  it("refuses a database a newer version has upgraded", async () => {
    const { db } = openSqlite<unknown>(path);
    await migrate(db, { ...migrations, "9999_future": { up: async () => {} } });
    await db.destroy();
    await expect(openDatabase(path)).rejects.toThrow(
      /upgraded by a newer version of the site builder \(migration 9999_future\)/,
    );
  });
});

// Each release's saved database (scripts/fixture.ts): this build must take it
// on, find every stored document valid, and publish the whole site from it.
describe("saved release databases", () => {
  const fixtures = join(import.meta.dirname, "fixtures");
  const saved = readdirSync(fixtures).filter((file) => file.endsWith(".sql"));
  const releases = saved.filter((file) => !file.startsWith("analytics-"));
  const analytics = saved.filter((file) => file.startsWith("analytics-"));
  it("has one for each release", () => {
    expect(releases).toContain("0001_baseline.sql");
    expect(analytics).toContain("analytics-0001_baseline.sql");
  });
  for (const release of analytics)
    it(`opens and reports on ${release.replace(".sql", "")}`, async () => {
      const file = join(dir, "analytics.db");
      const { sqlite } = openSqlite<unknown>(file);
      sqlite.exec(readFileSync(join(fixtures, release), "utf8"));
      sqlite.close();
      const [stats, site] = await Promise.all([
        openAnalyticsDatabase(file),
        openDatabase(":memory:"),
      ]);
      try {
        const day = await since(stats);
        expect(day).not.toBeNull();
        const report = await summary(stats, site, { from: day!, to: day! });
        expect(report.current.views).toBeGreaterThan(0);
      } finally {
        await Promise.all([stats.destroy(), site.destroy()]);
      }
    });
  for (const release of releases)
    it(`boots and publishes ${release.replace(".sql", "")}`, async () => {
      const { sqlite } = openSqlite<unknown>(path);
      sqlite.exec(readFileSync(join(fixtures, release), "utf8"));
      sqlite.close();
      const db = await openDatabase(path);
      try {
        expect((await checkStoredDocuments(db as Kysely<unknown>)).failed).toBe(0);
        // Every page that's live: not deleted, and not an entry scheduled for later.
        const live = await db
          .selectFrom("pages")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("published_revision_id", "is not", null)
          .where("deleted_at", "is", null)
          .where((eb) =>
            eb.or([eb("kind", "!=", "entry"), eb("publish_at", "<=", new Date().toISOString())]),
          )
          .executeTakeFirstOrThrow();
        const { counts } = await publishSite({
          db,
          dataDir: dir,
          siteUrl: "https://agensi.gov.my",
          full: true,
        });
        expect(counts.pages).toBe(Number(live.n));
        expect(existsSync(join(dir, "public", "index.html"))).toBe(true);
      } finally {
        await db.destroy();
      }
    });
});

describe("the stored documents check", () => {
  it("names each document that fails, and counts the rest", async () => {
    const db = (await openDatabase(":memory:")) as Kysely<unknown>;
    for (let i = 0; i < 25; i++) await addPage(db, invalid);
    await sql`insert into settings (key, value) values ('theme.draft', '{"preset":"pink"}')`.execute(
      db,
    );
    const result = await checkStoredDocuments(db);
    expect(result.failed).toBe(26);
    expect(result.problems).toHaveLength(20);
    expect(result.problems[0]).toMatchObject({ document: "page drafts" });
    await db.destroy();
  });

  it("covers every site document's draft, live and previous copies", async () => {
    const db = (await openDatabase(":memory:")) as Kysely<unknown>;
    for (const scope of ["draft", "published", "previous"])
      await sql`insert into settings (key, value) values (${`navigation.${scope}`}, '{}')`.execute(
        db,
      );
    expect((await checkStoredDocuments(db)).failed).toBe(3);
    await db.destroy();
  });
});

describe("rewriteDocuments", () => {
  it("rewrites only the documents it changes", async () => {
    const db = (await openDatabase(":memory:")) as Kysely<unknown>;
    await addPage(db, { ms: { title: "Lama", blocks: [] } });
    await rewriteDocuments(db, ["page drafts"], (doc) => {
      const d = doc as { ms: { title: string } };
      return d.ms.title === "Lama" ? { ...d, ms: { ...d.ms, title: "Baharu" } } : d;
    });
    const { rows } = await sql<{ draft: string }>`select draft from pages`.execute(db);
    expect(rows.map((r) => (JSON.parse(r.draft) as typeof valid).ms.title)).toContain("Baharu");
    expect(rows.map((r) => (JSON.parse(r.draft) as typeof valid).ms.title)).not.toContain("Lama");
    await db.destroy();
  });

  it("rejects a list that doesn't exist", async () => {
    const db = (await openDatabase(":memory:")) as Kysely<unknown>;
    await expect(rewriteDocuments(db, ["drafts"], (d) => d)).rejects.toThrow(/drafts/);
    await db.destroy();
  });
});

describe("parseStored", () => {
  const schema = z.object({ on: z.boolean() });
  it("gives undefined for a missing document, for the caller's defaults", () => {
    expect(parseStored(schema, undefined, "x")).toBeUndefined();
  });
  it("throws for one that fails its schema, instead of falling back to defaults", () => {
    expect(() => parseStored(schema, { on: "yes" }, "search (draft)")).toThrow(
      /stored search \(draft\) doesn't match/,
    );
  });
});

// A change here is a change to what stored content must look like. If content
// already saved might not pass it, add a migration that rewrites it
// (rewriteDocuments, docs/upgrades.md), then update the snapshot.
describe("stored document schemas", () => {
  const schemas = new Map<z.ZodType, string[]>();
  for (const doc of storedDocuments)
    schemas.set(doc.schema, [...(schemas.get(doc.schema) ?? []), doc.name]);
  for (const [schema, names] of schemas)
    it(names.join(", "), () => {
      expect(z.toJSONSchema(schema, { unrepresentable: "any" })).toMatchSnapshot();
    });
});
