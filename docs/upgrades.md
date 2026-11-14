# Upgrades: keeping stored content readable

Status: built. The baseline (section 6) is in, and its saved database is `apps/server/test/fixtures/0001_baseline.sql`.

An agency upgrades by running a newer build against the same `DATA_DIR`. The SQL schema is handled by the migrations in `apps/server/src/db/migrations.ts`. The harder part is the JSON inside it: every draft, revision and site document was written by the block and contract schemas of the build that saved it, and history keeps old shapes around for years. This plan makes sure an upgrade never leaves content the new build can't read, and never quietly replaces it.

## Decisions

| Question                         | Decision                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How is stored content versioned? | By the migration number. There is no `schemaVersion` on each document. Content only moves between installs as a whole backup, which carries its migration number |
| How does content change shape?   | A numbered migration rewrites the JSON in place at boot, with `rewriteDocuments` (section 4)                                                                     |
| What if content still fails?     | The server refuses to start: it puts back the database it had before migrating and names the rows that failed. It never falls back to defaults                   |
| Older data to support            | From 1.0 (`0001_baseline`) on. Older development databases are taken on as section 6 says                                                                        |

## The rule

**After migrations, every stored document parses against the current schema.** A schema change that some stored content wouldn't pass ships in the same commit as a migration that rewrites that content.

Changes that need no migration:

- adding an optional field, or a field with a Zod `.default()` (`withDefaults` fills it on read);
- adding a block type, a select option or a page kind;
- loosening a limit.

Changes that need one:

- renaming or removing a field, block type or option;
- changing a field's type;
- tightening a limit (`max`, a regex, a required field);
- splitting or merging blocks.

## What counts as stored content

One list in `apps/server/src/db/documents.ts` names every place schema-shaped JSON is kept, with the schema it must pass:

| Where                                                                                     | Schema                         |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| `pages.draft`                                                                             | `PageDocument`                 |
| `revisions.content` (published and draft revisions)                                       | `PageDocument`                 |
| `pages.listing`                                                                           | `ListingSettings`              |
| `settings` rows `<doc>.draft`, `<doc>.published`, `<doc>.previous` for each `SiteDocName` | that document's schema         |
| `settings` row `preferences`                                                              | `AdminPreferences`             |
| `jobs.payload` of jobs not yet finished                                                   | the payload schema of its kind |

Media's `variants` and `previous` are written only by the server and aren't edited by people, so they stay outside the list until something gives them a schema. `analytics.db` holds counts, not documents.

## Pieces

### 1. The check

`checkStoredDocuments(db)` walks the list and strictly parses every row. It returns the failures (table, row id or key, Zod issue path and message), capped at a readable number, with a total count. It is read-only.

- **At boot**, it runs only when migrations were applied, so an ordinary restart doesn't parse every revision.
- **On demand**: `laman check` runs it at any time and exits non-zero on a failure. This is for operators and CI. `laman backup --verify` runs the same check on an archive.

### 2. Boot: snapshot, migrate, check, or put it back

`openDatabase` changes from "migrate" to:

1. Find the pending migrations. If there are none, open as now.
2. If the database contains a migration this build doesn't know, stop with "This database was upgraded by a newer version of Laman (migration `0014_…`). Run that version, or restore a backup made before it." Kysely already throws `corrupted migrations` here; this replaces it with a clear message.
3. Fold the WAL into the file (`wal_checkpoint(TRUNCATE)`) and copy it to `DATA_DIR/upgrade/site-<from>-to-<to>.db`. Nothing else is writing yet, because the server isn't listening, so the copy is byte-identical to the database before the upgrade. A brand-new database gets no snapshot.
4. Run the migrations, then the foreign-key check (as now), then `checkStoredDocuments`.
5. If any of these fails, close the database, move the snapshot back over `site.db` (removing `-wal` and `-shm`), log what failed and exit with a non-zero code. The agency is left on the old version with its data as it was.
6. If it passes, keep the newest snapshot only. Before migrating, the snapshot is also written to `BACKUP_DIR` as a database-only archive (`<site-name>-<time>-db.tar.gz`), which stays under the backup retention; if that fails, nothing is migrated.

Kysely doesn't run SQLite migrations in a transaction, so the snapshot is also the only protection when a migration fails halfway. It doesn't wait on the backup feature: it's a few lines, and the backup command can reuse it later. `analytics.db` gets steps 1–5 for its own migrations, without the document check.

### 3. Strict reads

Once boot guarantees that stored content is valid, content that fails to parse at runtime is a bug, and it must not be hidden:

- `readDoc` and `previousOf` (`apps/server/src/content/site.ts`), `parseListingSettings` and the preferences read: a **missing** row still gives the defaults, but a row that is **present and invalid** throws `HttpError(500, "stored_document_invalid", …)` naming the document. Today it silently returns defaults, which the next save writes over the agency's real settings.
- Pages keep their `JSON.parse(...) as PageDocument` reads. The boot check already guarantees they're valid, and nothing replaces a page that fails, so a Zod parse on every read (`listPages` reads every draft) would cost time without saving anything.

`parseStored` in `apps/server/src/db/documents.ts` does this: undefined for a missing document, an error for an invalid one.

### 4. Writing a content migration

`rewriteDocuments` in `documents.ts` keeps each content migration short:

```ts
await rewriteDocuments(db, ["page drafts", "revisions"], (doc) => renameHeroTone(doc));
```

It takes the names of the lists in `documents.ts` and a pure function from old JSON to new JSON (`unknown` in, `unknown` out), and writes back only the rows it changed. The pure function describes the old shape with its own local types, never with the current schema's types, because those keep changing after the migration is written. Each function gets a unit test (in a `test/migrations.test.ts`, the first time one is needed).

### 5. CI: tests that upgrades still work

- **Saved databases from each release.** `pnpm --filter @laman/server fixture` (`scripts/fixture.ts`) builds a site that uses everything, through the API: every template, a page with every block, a listing with pinned and scheduled entries that use every entry block, pages whose drafts have moved on from what's live, a moved page (with its redirect) and a deleted one, every site document with draft, live and previous copies that differ, the security setting, an editor, a pending invite, an upload, and queued jobs, one scheduled. Before saving, it checks that every list in `storedDocuments` has rows, so a new kind of stored document can't be left out. It saves the database as a text SQL dump (`sqlite3 .dump`, so it can be reviewed in a diff) named after the build's last migration, `apps/server/test/fixtures/0001_baseline.sql` for 1.0, and refuses to make one that's already saved. Every release adds one from its own build, and none is edited afterwards. `test/upgrade.test.ts` loads each, runs the boot path, checks every stored document, and publishes the whole site, expecting every live page. Media files aren't in a dump, so no page uses the upload. The script also saves the release's analytics database, with a few visits, as `analytics-<migration>.sql`; the test opens each with this build's analytics migrations and runs a report over it.
- **A test that flags every schema change.** `test/upgrade.test.ts` writes `z.toJSONSchema` of each schema in `documents.ts` to a committed snapshot (`test/__snapshots__/upgrade.test.ts.snap`); `pnpm --filter @laman/server test -u` updates it. When a schema changes, the test fails with "A stored document's schema changed: if stored content might not pass, add a content migration; then update the snapshot." It can't tell additive changes from breaking ones, and isn't meant to. It makes the author decide, and puts that decision in the diff for review.
- **A failing upgrade must refuse to start.** A test plants a document that fails the check after migrating, and asserts that boot exits and leaves the original `site.db` byte-identical.

### 6. The baseline

`0001_baseline` is the schema 1.0 ships with. It was squashed twice, both times before any release:

1. **The development migrations** (`0001_pages` to `0013_utc_times` for `site.db`, `0001_analytics` and `0002_report_indexes` for `analytics.db`) into one `0001_baseline` each. That also removed `splitLinkLists` and its test.
2. **`site.db`'s first baseline and the four migrations after it** (`0002_agents`, `0003_content_changes`, `0004_calendar_sources`, `0005_api_tokens`) into one `0001_baseline` again: the same Kysely calls, with the columns those migrations added by `alterTable` written into their tables, in the same order. Both times the new baseline was checked to give exactly the schema the old migrations left: every table's columns, keys and indexes, every trigger, and the rows it seeds.

After 1.0, migrations are never squashed again.

`adoptBaseline` (`apps/server/src/db/index.ts`) takes on a database a development build made, going by the names `squashed` and `beforeBaseline` list (`apps/server/src/db/migrations.ts`):

- **One that ran all of `squashed`, in order** has the baseline's schema, so its record becomes `0001_baseline`.
- **One that stopped partway through them** is refused, with a message to start it once with a build that has `0005_api_tokens`, then with this one.
- **One made by the first baseline alone** is also refused. Its record is just `0001_baseline`, the same as a new database's, so the table only the squashed baseline makes (`baselineMarker`, `api_token_areas`) tells them apart.
- **One from before the first baseline** is refused: start again with a new data folder.

`test/upgrade.test.ts` covers each case.

## Build order

All built: the list and `laman check`, strict reads, the boot path for both databases, `rewriteDocuments`, the schema-change test and the failing-upgrade test, the rule in AGENTS.md, the baseline (squashed twice before 1.0), and `scripts/fixture.ts` with its saved databases.

## Not in this plan

- Release packaging, image tags, SBOMs and the patch-release policy.
- Per-document versions for import and export. If that's ever wanted, the pure functions from section 4 become each step's upgrader, run on the imported document.
