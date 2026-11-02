/**
 * Migrations, in order. Never edit one that has shipped: add a new one.
 * They run on every start, so an upgrade migrates before it serves.
 */
import { type Kysely, sql } from "kysely";
import { type Migration, type MigrationProvider, Migrator } from "kysely/migration";

export const migrations: Record<string, Migration> = {
  "0001_pages": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("pages")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("slug", "text", (c) => c.notNull().unique())
        .addColumn("position", "integer", (c) => c.notNull())
        .addColumn("draft", "text", (c) => c.notNull())
        .addColumn("published_revision_id", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .execute();
      await db.schema
        .createTable("revisions")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("page_id", "text", (c) => c.notNull().references("pages.id").onDelete("cascade"))
        .addColumn("content", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("revisions_page_id").on("revisions").column("page_id").execute();
      await db.schema
        .createTable("settings")
        .addColumn("key", "text", (c) => c.primaryKey())
        .addColumn("value", "text", (c) => c.notNull())
        .execute();
      await db.schema
        .createTable("jobs")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("kind", "text", (c) => c.notNull())
        .addColumn("payload", "text", (c) => c.notNull())
        .addColumn("status", "text", (c) => c.notNull())
        .addColumn("error", "text")
        .addColumn("attempts", "integer", (c) => c.notNull().defaultTo(sql`0`))
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("finished_at", "text")
        .execute();
      await db.schema
        .createIndex("jobs_status")
        .on("jobs")
        .columns(["status", "created_at"])
        .execute();
    },
  },

  // The page tree: pages get a parent, and a slug becomes one level of the
  // address, unique among siblings. SQLite can't drop the old UNIQUE(slug),
  // so the table is rebuilt (foreign keys are off while migrating).
  "0002_page_tree": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("pages_next")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("parent_id", "text", (c) => c.references("pages.id"))
        .addColumn("slug", "text", (c) => c.notNull())
        .addColumn("position", "integer", (c) => c.notNull())
        .addColumn("draft", "text", (c) => c.notNull())
        .addColumn("published_revision_id", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addColumn("deleted_at", "text")
        .execute();

      type OldPage = { id: string; slug: string; position: number };
      const { rows } = await sql<OldPage>`select id, slug, position from pages`.execute(db);
      const bySlug = new Map(rows.map((row) => [row.slug, row]));
      const home = bySlug.get("");
      // Positions were site-wide; they become 0…n among each page's siblings.
      const siblings = new Map<string | null, number>();
      for (const row of rows.toSorted((a, b) => a.position - b.position)) {
        // "a/b" goes under the page "a" when there is one, else under home as "a-b".
        const cut = row.slug.lastIndexOf("/");
        const parent = cut > 0 ? bySlug.get(row.slug.slice(0, cut)) : undefined;
        const parentId = row === home ? null : ((parent ?? home)?.id ?? null);
        const slug = parent ? row.slug.slice(cut + 1) : row.slug.replaceAll("/", "-");
        const position = siblings.get(parentId) ?? 0;
        siblings.set(parentId, position + 1);
        await sql`insert into pages_next
          select id, ${parentId}, ${slug}, ${position}, draft, published_revision_id, created_at, updated_at, null
          from pages where id = ${row.id}`.execute(db);
      }
      await db.schema.dropTable("pages").execute();
      await sql`alter table pages_next rename to pages`.execute(db);
      await sql`create unique index pages_sibling_slug on pages (coalesce(parent_id, ''), slug)
        where deleted_at is null`.execute(db);
      await db.schema.createIndex("pages_parent_id").on("pages").column("parent_id").execute();

      // Old addresses that send visitors on: from moves, unpublishing and deletes.
      // A page's own redirect is part of its draft instead.
      await db.schema
        .createTable("redirects")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("source_path", "text", (c) => c.notNull().unique())
        .addColumn("target_page_id", "text", (c) => c.references("pages.id").onDelete("cascade"))
        .addColumn("target_url", "text")
        .addColumn("status", "integer", (c) => c.notNull())
        .addColumn("page_id", "text", (c) => c.references("pages.id").onDelete("set null"))
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();

      await db.schema.alterTable("jobs").addColumn("result", "text").execute();
    },
  },

  // The media library: files under DATA_DIR/media/<id>/, and which pages
  // (or settings) use each one, kept up to date on every save.
  "0003_media": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("media")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("filename", "text", (c) => c.notNull())
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("ext", "text", (c) => c.notNull())
        .addColumn("size", "integer", (c) => c.notNull())
        .addColumn("width", "integer")
        .addColumn("height", "integer")
        .addColumn("alt", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("caption", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("credit", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("variants", "text", (c) => c.notNull().defaultTo("[]"))
        .addColumn("variants_size", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("status", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .execute();
      await db.schema
        .createTable("media_usage")
        .addColumn("media_id", "text", (c) =>
          c.notNull().references("media.id").onDelete("cascade"),
        )
        .addColumn("owner", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("media_usage_pk", ["media_id", "owner"])
        .execute();
      await db.schema.createIndex("media_usage_owner").on("media_usage").column("owner").execute();
    },
  },

  // Scheduled jobs: a queued job with run_at waits until then.
  "0004_scheduled_jobs": {
    async up(db: Kysely<unknown>) {
      await db.schema.alterTable("jobs").addColumn("run_at", "text").execute();
      await db.schema.createIndex("jobs_run_at").on("jobs").columns(["status", "run_at"]).execute();
    },
  },

  // The template a page started from, shown on its Details tab.
  "0005_page_template": {
    async up(db: Kysely<unknown>) {
      await db.schema.alterTable("pages").addColumn("template", "text").execute();
    },
  },

  // Publishing and history: a per-page log on publish jobs, and draft
  // revisions beside published ones.
  "0006_history": {
    async up(db: Kysely<unknown>) {
      await db.schema.alterTable("jobs").addColumn("log", "text").execute();
      await db.schema
        .alterTable("revisions")
        .addColumn("kind", "text", (c) => c.notNull().defaultTo("published"))
        .execute();
      await db.schema
        .createIndex("revisions_page_created")
        .on("revisions")
        .columns(["page_id", "created_at"])
        .execute();
    },
  },

  // Listing pages and entries: entries are pages under their listing page,
  // with their publish date kept in a column for sorting and scheduling.
  "0007_listings": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .alterTable("pages")
        .addColumn("kind", "text", (c) => c.notNull().defaultTo("page"))
        .execute();
      await db.schema.alterTable("pages").addColumn("listing", "text").execute();
      await db.schema.alterTable("pages").addColumn("publish_at", "text").execute();
      await db.schema
        .createIndex("pages_listing_publish_at")
        .on("pages")
        .columns(["parent_id", "kind", "publish_at"])
        .execute();
    },
  },

  // The announcement leaves the navigation for a document of its own, so
  // posting it never publishes navbar changes.
  "0008_announcement": {
    async up(db: Kysely<unknown>) {
      for (const scope of ["draft", "published"]) {
        await sql`
          insert or ignore into settings (key, value)
          select ${`announcement.${scope}`}, json_extract(value, '$.announcement')
          from settings
          where key = ${`navigation.${scope}`}
            and json_extract(value, '$.announcement') is not null
        `.execute(db);
        await sql`
          update settings set value = json_remove(value, '$.announcement')
          where key = ${`navigation.${scope}`}
        `.execute(db);
      }
    },
  },

  // Media gets a lifecycle: deleted files wait in Recently deleted, a
  // replaced file keeps the one before it, and an image can be decorative.
  "0009_media_lifecycle": {
    async up(db: Kysely<unknown>) {
      await db.schema.alterTable("media").addColumn("deleted_at", "text").execute();
      await db.schema
        .alterTable("media")
        .addColumn("decorative", "integer", (c) => c.notNull().defaultTo(0))
        .execute();
      await db.schema.alterTable("media").addColumn("replaced_at", "text").execute();
      await db.schema.alterTable("media").addColumn("previous", "text").execute();
    },
  },

  // Site search starts on, but a site already published has no index yet:
  // its live copy starts off, so search waits to go live like any other
  // change, and the officer publishes it from the Search screen.
  "0010_site_search": {
    async up(db: Kysely<unknown>) {
      await sql`
        insert or ignore into settings (key, value)
        select 'search.published', ${JSON.stringify({ on: false, filters: true, pins: [] })}
        where exists (select 1 from pages where published_revision_id is not null)
      `.execute(db);
    },
  },
};

/** Runs `list` (site.db's by default) up to the latest. */
export async function migrate(db: Kysely<unknown>, list: Record<string, Migration> = migrations) {
  const provider: MigrationProvider = { getMigrations: async () => list };
  const { error, results } = await new Migrator({ db, provider }).migrateToLatest();
  if (error) throw error;
  return results ?? [];
}
