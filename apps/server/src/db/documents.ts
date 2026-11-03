/**
 * Every place site.db keeps schema-shaped JSON, with the schema it must pass.
 * After migrations, every row here parses against the current schemas: a
 * schema change that stored content wouldn't pass ships with a migration
 * that rewrites it (`rewriteDocuments`). See docs/upgrades.md.
 */
import { ListingSettings, PageDocument } from "@fiscal-sb/blocks";
import {
  AdminPreferences,
  Announcement,
  BackupPayload,
  Id,
  Navigation,
  PublishPayload,
  SecuritySettings,
  SiteDocName,
  SiteSearch,
  SiteSettings,
  SiteTheme,
} from "@fiscal-sb/contracts";
import { type Kysely, type RawBuilder, sql } from "kysely";
import { z } from "zod";
import { HttpError } from "../errors.js";

/** The schema of each site document, for its draft, live and previous copies. */
export const siteDocSchemas = {
  settings: SiteSettings,
  navigation: Navigation,
  announcement: Announcement,
  search: SiteSearch,
  theme: SiteTheme,
} as const satisfies Record<SiteDocName, z.ZodType>;

export type StoredDocument = {
  /** Names the list in check failures and in `rewriteDocuments`. */
  name: string;
  table: "pages" | "revisions" | "settings" | "jobs" | "users" | "oauth_clients";
  /** The row's unique key. */
  key: "id" | "key";
  column: string;
  where?: RawBuilder<unknown>;
  schema: z.ZodType;
};

const settingsRows = (keys: string[]) => sql`key in (${sql.join(keys.map((k) => sql.lit(k)))})`;

export const storedDocuments: StoredDocument[] = [
  { name: "page drafts", table: "pages", key: "id", column: "draft", schema: PageDocument },
  { name: "revisions", table: "revisions", key: "id", column: "content", schema: PageDocument },
  {
    name: "listing settings",
    table: "pages",
    key: "id",
    column: "listing",
    where: sql`listing is not null`,
    schema: ListingSettings,
  },
  ...SiteDocName.options.map((name): StoredDocument => ({
    name,
    table: "settings",
    key: "key",
    column: "value",
    where: settingsRows(["draft", "published", "previous"].map((scope) => `${name}.${scope}`)),
    schema: siteDocSchemas[name],
  })),
  {
    name: "preferences",
    table: "users",
    key: "id",
    column: "preferences",
    schema: AdminPreferences,
  },
  {
    name: "security",
    table: "settings",
    key: "key",
    column: "value",
    where: settingsRows(["security"]),
    schema: SecuritySettings,
  },
  // Finished publishes keep their payload too: undo reads its swaps.
  {
    name: "publish jobs",
    table: "jobs",
    key: "id",
    column: "payload",
    where: sql`kind = 'publish'`,
    schema: PublishPayload,
  },
  {
    name: "media jobs",
    table: "jobs",
    key: "id",
    column: "payload",
    where: sql`kind = 'media.variants'`,
    schema: z.object({ id: Id }),
  },
  {
    name: "backup jobs",
    table: "jobs",
    key: "id",
    column: "payload",
    where: sql`kind = 'backup'`,
    schema: BackupPayload,
  },
  // Where an agent's sign-in may return to (docs/mcp.md).
  {
    name: "agent redirect addresses",
    table: "oauth_clients",
    key: "id",
    column: "redirect_uris",
    schema: z.array(z.string()).min(1).max(10),
  },
];

type Row = { key: string; json: string };
const PAGE = 500;

/** The rows of one list, `PAGE` at a time in key order, so a long history isn't read at once. */
async function* rowsOf(db: Kysely<unknown>, doc: StoredDocument): AsyncGenerator<Row> {
  let after: string | null = null;
  for (;;) {
    const { rows }: { rows: Row[] } = await sql<Row>`
      select ${sql.ref(doc.key)} as key, ${sql.ref(doc.column)} as json
      from ${sql.table(doc.table)}
      where ${doc.where ?? sql`1 = 1`}
        and (${after} is null or ${sql.ref(doc.key)} > ${after})
      order by ${sql.ref(doc.key)}
      limit ${PAGE}
    `.execute(db);
    yield* rows;
    if (rows.length < PAGE) return;
    after = rows.at(-1)!.key;
  }
}

export type DocumentProblem = {
  /** The list it's in, e.g. "revisions". */
  document: string;
  /** Its row: a page or revision id, or a settings key. */
  row: string;
  issues: string[];
};

/** Problems kept in full; the rest are only counted. */
const SHOWN = 20;

/** Parses every stored document against its schema. Read-only. */
export async function checkStoredDocuments(
  db: Kysely<unknown>,
  list: StoredDocument[] = storedDocuments,
) {
  let checked = 0;
  let failed = 0;
  const problems: DocumentProblem[] = [];
  for (const doc of list)
    for await (const row of rowsOf(db, doc)) {
      checked++;
      const issues = issuesOf(doc.schema, row.json);
      if (!issues) continue;
      failed++;
      if (problems.length < SHOWN) problems.push({ document: doc.name, row: row.key, issues });
    }
  return { checked, failed, problems };
}

function issuesOf(schema: z.ZodType, json: string): string[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return ["not JSON"];
  }
  const result = schema.safeParse(value);
  return result.success
    ? undefined
    : result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/** The check's failures as lines for a log or the terminal. */
export function describeProblems({
  failed,
  problems,
}: {
  failed: number;
  problems: DocumentProblem[];
}) {
  const lines = problems.map((p) => `  ${p.document} ${p.row}: ${p.issues.join("; ")}`);
  if (failed > problems.length) lines.push(`  …and ${failed - problems.length} more`);
  return lines.join("\n");
}

/**
 * For a content migration: runs `change` on every document of the named
 * lists and writes back the ones it changed. `change` takes and returns plain
 * JSON; describe the old shape with local types, never the current schema's,
 * which keep moving after the migration is written.
 */
export async function rewriteDocuments(
  db: Kysely<unknown>,
  names: string[],
  change: (doc: unknown) => unknown,
) {
  const unknown = names.filter((n) => !storedDocuments.some((d) => d.name === n));
  if (unknown.length) throw new Error(`No stored documents named ${unknown.join(", ")}`);
  for (const doc of storedDocuments.filter((d) => names.includes(d.name)))
    for await (const row of rowsOf(db, doc)) {
      const json = JSON.stringify(change(JSON.parse(row.json)));
      if (json === row.json) continue;
      await sql`update ${sql.table(doc.table)} set ${sql.ref(doc.column)} = ${json}
        where ${sql.ref(doc.key)} = ${row.key}`.execute(db);
    }
}

/**
 * A stored document read at runtime, or undefined when there is none, for the
 * caller's defaults. One that fails its schema is an error, never the
 * defaults, which the next save would write over the real content.
 */
export function parseStored<T>(schema: z.ZodType<T>, value: unknown, what: string): T | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new HttpError(
    500,
    "stored_document_invalid",
    `The stored ${what} doesn't match this version's schema. Run "site-builder check" for details.`,
  );
}
