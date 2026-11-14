# Brief: incremental publishing

2 Nov 2026. Makes publishing scale with what changed, not with the size of the site. Follows the publisher described in `docs/laman.md` (§ Publisher) and the publish log in `docs/briefs/publishing-outcome.md`.

## Why

`publishSite` (`apps/server/src/publisher.ts`) starts every publish from an empty `public.next` and renders every address the site has: every page and entry, every later page of every listing, every category page. At today's size that is instant. A news listing with thousands of entries makes every publish, including fixing a typo in one article, re-render thousands of pages through Astro.

## Not ISR

Incremental Static Regeneration renders on a visitor's request and caches the result. That needs a server behind the site, and the published site is meant to be plain files that keep working "if the builder is switched off", served by nginx, Caddy, an object store or a CDN. So the output stays fully static; what changes is how much of it a publish rebuilds.

## Decisions

| Question                 | Decision                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| How to know what changed | Hash each address's render input. Same hash as last time: the file on disk is already right, skip it.                       |
| Listing pagination       | Keep newest-first numbering and today's URLs. A new entry re-renders all of that listing's pages (~420 at 5,000 × 12/page). |
| The publish log          | Lists only what was written, removed, redirected or failed, plus a count of pages left unchanged.                           |
| Forcing a full rebuild   | `laman publish --full` on the CLI and a **Rebuild whole site** action in the admin.                                         |
| Scale target             | A 5,000-entry listing. Publishing one entry finishes in a few seconds.                                                      |

## How it works

### 1. A fingerprint per address

For every address the publisher would write, it already builds a complete `RenderInput` with `renderInputFor`: the page's blocks, site settings, navigation, announcement, listing items, the media it shows. The renderer reads nothing else (dates are formatted from the ISO strings in the input; no clock, files or environment), so the input decides the HTML.

The fingerprint is `sha256(rendererBuildId + canonicalJson(input))`:

- **`canonicalJson`** sorts object keys, so the same content always hashes the same.
- **`rendererBuildId`** is a hash of the renderer's built output (`apps/renderer/dist`), computed once at boot. Upgrading FTDS or changing a block wrapper changes it, so every page re-renders.

This covers dependencies without listing them: editing the navigation changes every page's input, publishing an entry changes the entry, its listing's pages and categories, and any page with a latest-entries block that shows it. Nothing else.

### 2. The manifest lives in the published folder

The fingerprints are stored in `public/.publish/manifest.json`, a map of address to hash, not in the database. It is written into `public.next` and swapped in with the rest of the site, so the files and the hashes describing them can never disagree:

- A failed publish leaves the old folder and the old manifest together.
- Deleting `public/` (or a restore that rebuilds it) means no manifest, so the next publish is a full one.
- A **full rebuild** just ignores the manifest.

The public server already serves `public/`; it must answer 404 for `/.publish/` (a check on that path only, not `dotfiles: "deny"`, which would also block `.well-known/`). On another web server the file is harmless: it only names published addresses.

### 3. Start from a hardlinked copy

Instead of an empty folder, `public.next` begins as a hardlinked copy of `public/` (each file linked, not copied, so it is close to instant and costs no disk). Then:

- **Changed addresses:** rendered and written to a temporary name, then renamed over the link. Writing straight into a linked file would change the live copy too; a rename gives the new file its own inode.
- **Addresses no longer on the site:** deleted from `public.next` (they are in the old manifest and not in the new one). This replaces `lastWritten`, which reads paths back from the last publish's log and stops working once the log leaves unchanged pages out.
- **Always rebuilt** (cheap): `redirects.json`, redirect pages, RSS feeds, `sitemap.xml`.
- **Renderer assets:** `_astro/` and the other client files are replaced when `rendererBuildId` changes, and left alone otherwise.
- **Media:** a folder is copied when it is missing or has been replaced since; folders no published page uses any more are deleted.

The swap, the all-or-nothing rule (any failed page aborts the publish and leaves the live site as it was), and the per-block failure detail stay as they are.

If the hardlink step fails (a filesystem without hard links), the publisher falls back to a full build into an empty folder.

### 4. Building the inputs cheaply

Every address still gets its input built and hashed on every publish, so that step must stay fast. Today `renderInputFor` and the entries functions call `loadTree` and read site documents again for each address; at 5,000 entries that is tens of thousands of repeated queries. One publish loads the tree, site documents, listing settings and each listing's entries once and passes them down (a per-publish context, the way `listingRenderOf` already takes its parts without the database).

If a site grows well past the target (20,000+ entries) and building inputs becomes the slow part, the next step is recording each address's dependencies during the render so unaffected addresses aren't even looked at. Not part of this work.

## Contract and admin changes

- **`PublishPayload`** gains `full?: boolean`. The publish job passes it to `publishSite`.
- **The job's counts** gain `unchanged` (addresses skipped) alongside `pages`, `redirects` and `media`, and `full` saying whether the publish rebuilt everything.
- **`PublishLogEntry`** is unchanged: it simply has no rows for unchanged pages.
- **Admin, publish log:** a line's details show "1,204 pages unchanged" under the list of what was written. A full rebuild's line says "Whole site rebuilt".
- **Admin, Rebuild whole site:** on Publishing, in a second FTDS **Details** below the scheduling one ("Troubleshooting", closed by default), so editors don't reach for it as a normal publish. It asks first with an FTDS **AlertDialog**: it publishes nothing new, takes longer, and the site stays up throughout. It queues a `publish` job with `{ trigger: "manual", full: true }`.
- **CLI:** `laman publish --full`. Plain `publish` becomes incremental.
- All new strings through `t()` in `apps/admin/src/i18n/messages/en.ts`.

## Steps

1. **Per-publish context.** Load the tree, documents, listing settings and entries once per publish; thread them through `renderInputFor` and the entries functions. The canvas and preview keep loading per request. Output is byte-identical to today (checked by test).
2. **Fingerprints and the manifest.** `canonicalJson`, `rendererBuildId`, writing `.publish/manifest.json`; 404 for `/.publish/` on the public server.
3. **Incremental build.** Hardlinked start, skip on matching hash, temp-and-rename writes, deletions from the manifest diff, media and asset rules, fallback to a full build. Remove `lastWritten`.
4. **Full rebuild.** `full` in `PublishPayload`, the CLI flag, the counts.
5. **Admin.** Unchanged count and "Whole site rebuilt" in the log, the Troubleshooting disclosure with Rebuild whole site.
6. **Scale check.** A dev-only seed command that adds a 5,000-entry listing; time a full publish and a one-entry publish, and record both numbers in this brief.

## Tests

- Publishing twice with no changes writes nothing the second time; the live folder's files keep their inodes.
- Editing one entry rewrites exactly: the entry, its listing's pages, its categories' pages, pages whose latest-entries block shows it, the RSS feed.
- Editing navigation or settings rewrites every page.
- Unpublishing or moving a page removes its old address; a redirect replaces it where one exists.
- A changed `rendererBuildId` rewrites every page and replaces `_astro/`.
- A replaced media file is copied again; an unused one is removed.
- A failed render leaves `public/` and its manifest exactly as they were.
- No manifest, or `full: true`, gives the same folder as today's full build.
- Writing a changed page never changes the file in `public/` it was linked to.
- `GET /.publish/manifest.json` on the public server is a 404.

## Results

Measured with `pnpm --filter @laman/server scale` (a listing of 5,000 entries, 12 a page: 5,420 addresses), on an M-series Mac, APFS:

| Publish          | Time  | Written | Unchanged |
| ---------------- | ----- | ------- | --------- |
| Full (`--full`)  | 3.7 s | 5,420   | 0         |
| Nothing changed  | 1.9 s | 0       | 5,420     |
| One entry edited | 2.0 s | 2       | 5,418     |
| One entry added  | 2.5 s | 418     | 5,003     |

What the time goes on, for a publish that writes almost nothing: hard-linking the live folder (~1.2 s, about 11,000 links and folders), building and hashing every address's input (~0.8 s), and removing the old folder after the swap (~0.5 s). Rendering is cheap with today's entries (about 0.5 ms a page); the saving grows with how heavy pages are, while the fixed cost grows with how many files the site has. Linux filesystems are usually quicker at links and folders than APFS, so a server should do better than these numbers.

An edited entry writes two addresses, not a whole listing: it stays on the same listing page, so only that page and the entry change. Adding an entry writes every listing page, as decided above.

If the fixed cost becomes the problem, the next step is to stop copying the folder at all: write changed files into the live folder one by one (each through a rename, so no file is ever half-written) and give up swapping the whole site at once. Not done here, because a visitor could then briefly see a new listing page beside an old entry.

## Found along the way

- A publish started from the CLI while the server's queue is also publishing would share `public.next`. That was true before this change too. Run `laman publish` with the server stopped, or use **Rebuild whole site** instead.

## Out of scope

- Request-time rendering of any kind.
- Dependency tracking (see § 4).
- Pagefind. When it lands it indexes the whole folder after each publish; it is fast enough that incremental indexing isn't needed.
- Stable pagination that never shifts old pages.
