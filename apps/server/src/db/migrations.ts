/**
 * Migrations, in order. Never edit one that has shipped: add a new one.
 * They run on every start, so an upgrade migrates before it serves.
 *
 * 0001_baseline is the schema as 1.0 shipped it: the development
 * migrations before it were squashed into it (docs/upgrades.md § The 1.0
 * baseline) and are never squashed again.
 */
import { type Kysely, sql } from "kysely";
import { type Migration, type MigrationProvider, Migrator } from "kysely/migration";

/** The development migrations 0001_baseline replaced (docs/upgrades.md § The 1.0 baseline). */
export const beforeBaseline = [
  "0001_pages",
  "0002_page_tree",
  "0003_media",
  "0004_scheduled_jobs",
  "0005_page_template",
  "0006_history",
  "0007_listings",
  "0008_announcement",
  "0009_media_lifecycle",
  "0010_site_search",
  "0011_links_and_downloads",
  "0012_users",
  "0013_utc_times",
];

export const migrations: Record<string, Migration> = {
  "0001_baseline": {
    async up(db: Kysely<unknown>) {
      // Pages: a tree of drafts, each with its published revision; entries
      // live under a listing. Deleted pages wait in Recently deleted.
      await db.schema
        .createTable("revisions")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("page_id", "text", (c) => c.notNull().references("pages.id").onDelete("cascade"))
        .addColumn("content", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("kind", "text", (c) => c.notNull().defaultTo("published"))
        .addColumn("created_by", "text")
        .execute();
      await db.schema
        .createTable("settings")
        .addColumn("key", "text", (c) => c.primaryKey())
        .addColumn("value", "text", (c) => c.notNull())
        .addColumn("updated_by", "text")
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
        .addColumn("result", "text")
        .addColumn("run_at", "text")
        .addColumn("log", "text")
        .addColumn("created_by", "text")
        .execute();
      await db.schema
        .createTable("pages")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("parent_id", "text", (c) => c.references("pages.id"))
        .addColumn("slug", "text", (c) => c.notNull())
        .addColumn("position", "integer", (c) => c.notNull())
        .addColumn("draft", "text", (c) => c.notNull())
        .addColumn("published_revision_id", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addColumn("deleted_at", "text")
        .addColumn("template", "text")
        .addColumn("kind", "text", (c) => c.notNull().defaultTo("page"))
        .addColumn("listing", "text")
        .addColumn("publish_at", "text")
        .addColumn("updated_by", "text")
        .execute();
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

      // Media: the library, and which pages and documents use each file.
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
        .addColumn("deleted_at", "text")
        .addColumn("decorative", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("replaced_at", "text")
        .addColumn("previous", "text")
        .addColumn("created_by", "text")
        .execute();
      await db.schema
        .createTable("media_usage")
        .addColumn("media_id", "text", (c) =>
          c.notNull().references("media.id").onDelete("cascade"),
        )
        .addColumn("owner", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("media_usage_pk", ["media_id", "owner"])
        .execute();

      // People: accounts, sessions, one-time links, recovery codes and the audit log.
      await db.schema
        .createTable("users")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("username", "text", (c) => c.notNull().unique())
        .addColumn("display_name", "text", (c) => c.notNull())
        .addColumn("role", "text", (c) => c.notNull())
        .addColumn("password_hash", "text", (c) => c.notNull())
        .addColumn("must_change_password", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("totp_secret", "text")
        .addColumn("totp_last_step", "integer")
        .addColumn("totp_enrolled_at", "text")
        .addColumn("preferences", "text", (c) => c.notNull().defaultTo('{"language":"en"}'))
        .addColumn("disabled_at", "text")
        .addColumn("last_sign_in_at", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("created_by", "text")
        .execute();
      await db.schema
        .createTable("sessions")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("token_hash", "text", (c) => c.notNull().unique())
        .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
        .addColumn("stage", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("last_seen_at", "text", (c) => c.notNull())
        .addColumn("ip", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("user_agent", "text", (c) => c.notNull().defaultTo(""))
        .execute();
      await db.schema
        .createTable("tokens")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("token_hash", "text", (c) => c.notNull().unique())
        .addColumn("kind", "text", (c) => c.notNull())
        .addColumn("role", "text")
        .addColumn("user_id", "text", (c) => c.references("users.id").onDelete("cascade"))
        .addColumn("note", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("created_by", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("expires_at", "text", (c) => c.notNull())
        .addColumn("used_at", "text")
        .execute();
      await db.schema
        .createTable("recovery_codes")
        .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
        .addColumn("code_hash", "text", (c) => c.notNull())
        .addColumn("used_at", "text")
        .addPrimaryKeyConstraint("recovery_codes_pk", ["user_id", "code_hash"])
        .execute();
      await db.schema
        .createTable("audit_log")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("at", "text", (c) => c.notNull())
        .addColumn("user_id", "text")
        .addColumn("action", "text", (c) => c.notNull())
        .addColumn("target", "text")
        .addColumn("detail", "text", (c) => c.notNull().defaultTo("{}"))
        .addColumn("ip", "text")
        .execute();

      for (const [name, table, columns] of [
        ["revisions_page_id", "revisions", ["page_id"]],
        ["jobs_status", "jobs", ["status", "created_at"]],
        ["pages_parent_id", "pages", ["parent_id"]],
        ["media_usage_owner", "media_usage", ["owner"]],
        ["jobs_run_at", "jobs", ["status", "run_at"]],
        ["revisions_page_created", "revisions", ["page_id", "created_at"]],
        ["pages_listing_publish_at", "pages", ["parent_id", "kind", "publish_at"]],
        ["sessions_user", "sessions", ["user_id"]],
        ["audit_log_at", "audit_log", ["at"]],
        ["audit_log_user", "audit_log", ["user_id", "id"]],
        ["audit_log_action", "audit_log", ["action", "id"]],
      ] as const)
        await db.schema
          .createIndex(name)
          .on(table)
          .columns([...columns])
          .execute();
      // A slug is one level of the address: unique among a page's live siblings.
      await sql`create unique index pages_sibling_slug on pages (coalesce(parent_id, ''), slug)
        where deleted_at is null`.execute(db);
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
