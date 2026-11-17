# Roadmap

> Draft by Claude from the repo, docs, issues and commits as of 14 Nov 2026. Owned by Irfan: edit freely. `/pm` reads this file and only proposes changes to it.

## Now (this quarter, in priority order)

1. **A 1.0 release an agency can install without cloning the repo.** The schema is already frozen as 1.0; the release itself doesn't exist yet.
   - Done when: a `v1.0.0` tag and GitHub release exist; a versioned Docker image is published and `docs/install-docker.md` installs and upgrades from it rather than from `git clone`; the release's database is saved with `pnpm --filter @laman/server fixture`; package versions are no longer `0.0.0`; the release and patch policy is written down.
   - Also before 1.0: **media lives in object storage, only.** Laman stops keeping media on the server's disk: the media library is always in S3-compatible storage, so there is one code path and no second copy in `public/media`, and with an agency's own provider and a CDN, images and PDFs aren't served by the builder at all. Decided by Irfan, 17 Nov 2026:
     - **A bundled store by default.** `compose.yaml` ships RustFS, an S3-compatible server, with a volume behind it, so an install still needs no cloud account, and agencies that can't use public cloud storage can still run Laman. Dev and the tests use the same RustFS container. Its image is pinned to a version like Laman's other dependencies. Chosen by Irfan, 17 Nov 2026.
     - **Or the agency's own provider, set up in the app.** Settings → Media storage, for the super admin: a provider from those off-site backups support (AWS S3, Google Cloud Storage, Cloudflare R2, Wasabi, DigitalOcean Spaces, MinIO, any S3-compatible; Azure when it's back), with buckets and keys of its own, not the backup connection, and Test connection with plain errors as off-site backups have. The secret key is sealed in `site.db` with `BACKUP_SECRET_KEY`, as the off-site one is, so a restore brings the setup back; the screen and guides say that losing the key leaves a restored site unable to reach its media. Only the bundled store's address and keys are environment variables, since `compose.yaml` gives the same keys to RustFS and Laman. Decided by Irfan, 17 Nov 2026.
     - **Locked once the library has files.** The storage can't be changed while the library has live files; files in Recently deleted don't count. A setup can be removed (back to the bundled store) only while there are none, and a new one entered after; removing it purges Recently deleted first, so those files can no longer be put back, and the screen says so. Laman never copies media between stores. Decided by Irfan, 17 Nov 2026.
     - **Every bucket private.** Uploads, their WebP sizes and previous files go to a private bucket; the admin, canvas and previews get them through short-lived presigned links (minutes), so only signed-in officers can open a file that isn't live. Publishing copies the files live pages use to a separate published bucket, also private, read by one thing: the builder, which serves `/media/*` from it on the bundled store, or a CDN with origin access (such as CloudFront origin access control) on the agency's own provider. A public-read published bucket is the documented fallback for agencies without a CDN. Published pages never carry presigned links: they expire, and the site must keep working with the builder off and stay cacheable. Decided by Irfan, 17 Nov 2026.
     - **Backups are the database; media is protected beside them.** The archive holds `site.db` (and `analytics.db` with `--with-analytics`), as the existing database-only backup does. The previous file kept at each replace (`media-previous/` today) moves to the bucket with the rest, so "Put back the previous file" keeps working.
       - **Bundled store: mirrored off-site.** RustFS's volume is on the same disk as the database, so after each backup the media bucket is copied to the off-site backup bucket, sending only files not already there. Without off-site backups set up, Settings and the dashboard warn that media has no copy off the server.
       - **Own provider: its versioning.** The bucket's own versioning or replication protects it, which the install guide says to switch on; the off-site mirror is optional.
       - **Kept as long as backups.** Old and deleted versions of media stay at least as long as the oldest backup a restore could use (about 35 days locally, longer for off-site monthly copies); the install guide gives the lifecycle rule.
       - **Restore checks the match.** A restored database is checked against the bucket, and every media file it names that isn't there is listed, as the backup manifest's `missing` does today.
     - Done when: no media is written under `DATA_DIR`; a fresh `docker compose up` works with the bundled store with nothing to set up; a super admin can set up their own provider in Settings, test it, and remove it, but only while the library has no live files, and removing it purges Recently deleted; uploads, WebP sizes, replacements and previous files land in the private bucket and only files used by live pages in the published one; neither bucket is readable without credentials on the bundled store, and the admin opens private files only through presigned links; published pages and `public/` hold no media files and link to `/media/*` (bundled) or the CDN's address; a backup holds only the databases, and on the bundled store the media mirror reaches the off-site bucket; a restore lists missing media; the media library, canvas and previews show the files with no CSP errors; the install and restore guides cover the storage, the CDN setup and the sealing key; tests run the media store against the bundled container.
     - Evidence: media is kept under `DATA_DIR/media` (`apps/server/src/content/media.ts`) and copied into `public/media` at every publish (`apps/server/src/publisher.ts`), so live media takes its disk space twice and its bandwidth comes from the server; the providers are `OffsiteProvider` in `packages/contracts/src/offsite.ts`.
   - Evidence: `docs/install-docker.md` ("there's no published image yet"); `docs/upgrades.md` § Not in this plan (release packaging, image tags, SBOMs, patch policy) and § Saved databases ("`0001_baseline.sql` for 1.0"); no tags or releases on GitHub; `"version": "0.0.0"` in `package.json`.

2. **A first-time officer can run the site with no handover.** Test the admin with officers who've never seen it, and fix what they trip on.
   - Done when: three to five officers new to Laman have done walkthroughs A, B and D from `docs/admin-evaluation.md`; the findings are written up in `docs/`; posting an urgent announcement on a phone is timed against the 2-minute target; each blocking finding has an issue.
   - Evidence: `PRODUCT.md` § Evidence on Hand ("No user research, usability tests …"); `docs/project-context.md` § Suggested next steps 1 and § Gaps in this context; `docs/admin-evaluation.md` (closing list, step 8); `docs/journeys/publish-model.md` (2-minute phone target).

## Next

- Bring Azure Blob Storage off-site backups back once a release can test them against a real account (`docs/laman.md` § Azure Blob Storage (parked)).
- MCP resources and prompts: the block catalogue, a content guide, the page tree; "build a page from a brief", "audit the site for accessibility" (`docs/mcp.md` § Resources and prompts (planned)).
- Lighter approval: a shareable, expiring preview link for a draft and an "Approved by" note in history. Proposed, not decided (`PRODUCT.md` § Open decisions, `docs/project-context.md` § Tensions 2).
- Documents as content: show a PDF's size and language beside its link, and offer an HTML alternative (`docs/project-context.md` § Tensions 6, `PRODUCT.md` § Open decisions).
- Message and Video blocks, and the hero's search, tasks and figures add-ons when FTDS ships them (`docs/briefs/hero-variants-and-html-in-canvas.md`).

## Not doing

From Irfan's decisions and the docs, where they rule these out:

- **BM and EN site content (KIV).** A site has one default language, now and for the foreseeable future. No second-language slot, side-by-side BM/EN editing or language switcher on published sites. Kept in view, not planned. Decided by Irfan, 14 Nov 2026.
- **Native (systemd) installs.** Laman installs as a container only (Docker image, `compose.yaml`). No `init` that installs a systemd unit, no bundled `laman-backup.timer`, no native install guide. Decided by Irfan, 14 Nov 2026.
- An approval workflow engine: "No approval layer. Draft and published versions, with history." (`docs/laman.md` § Constraints). A lighter approval note is under Next.
- Multi-tenancy, a shared cloud, or anything we operate (`docs/laman.md` § Constraints).
- Git-based content, or a CMS such as Payload underneath (`docs/laman.md` § Constraints).
- Free styling, custom HTML and plugins; agencies adding blocks or page kinds (`PRODUCT.md` § Positioning, § Capabilities).
- A Go server (`docs/laman.md` § Alternatives considered, rejected).
- A mail server (`docs/laman.md` § Constraints, Auth).
- Tracking beyond agency policy, pop-ups, interstitials, autoplaying carousels, newsletter gates (`PRODUCT.md` § Product Principles); identifying visitors across days or dodging filter lists (`docs/analytics.md`).
- Designing to SPLaSK or other government assessments; WCAG 2.2 AA only (`PRODUCT.md` § Accessibility & Inclusion, `docs/project-context.md`).
- Request-time rendering of the published site (`docs/briefs/incremental-publishing.md` § Out of scope).
- Dark mode on published sites; the admin is light only (`docs/briefs/component-coverage.md`, `PRODUCT.md`).
- CI that runs `pnpm check` or `pnpm verify`, by choice; the lefthook hooks are the gate (`AGENTS.md` § Before calling a change done).

## Known gaps

- No CI runs `pnpm check` or `pnpm verify` (by choice, to save GitHub Actions minutes); the gate is the local lefthook hooks, `pnpm check` before commit and `pnpm verify` before push, which a commit from another machine without hooks or the GitHub UI skips. `.github/workflows/www.yml` only deploys the marketing site. `docs/laman.md` § Alternatives considered still says "`pnpm audit` and Renovate in CI".
- Azure Blob Storage off-site backups are written but parked until a release can test them against real Azure.
- `packages/contracts` has no tests of its own (its schemas are exercised through the server's tests).
- `apps/renderer` has no test script or test folder.
- The editor (`apps/admin/src/editor/`) has no tests: `apps/admin/test/` covers agent tools, backups, i18n, the page diff and registry translations only.
- A publish started from the CLI while the server's queue is also publishing shares `public.next` (`docs/briefs/incremental-publishing.md` § Found along the way).
- Stale docs: `PRODUCT.md` § Capabilities lists sign-in, roles, the audit log, Pagefind search and backups as not built, and names FTDS v0.2.0 (now v0.2.6); `docs/laman.md` still opens with "Architecture only; no code yet"; `docs/admin.md` describes open-page tabs and a status bar the admin has since dropped (`docs/project-context.md` § Tensions 1).
- No open issues, so none is labelled `ready` and `/pm` has nothing to start from yet.

## Questions for Irfan

1. The order of "Now" is a guess (the release, then user testing). Should user testing start on a pre-release build instead, so findings land in 1.0?
2. Should each "Now" goal be split into issues labelled `ready` so `/pm` can propose work? There are no open issues today.
