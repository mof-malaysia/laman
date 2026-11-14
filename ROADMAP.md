# Roadmap

> Draft by Claude from the repo, docs, issues and commits as of 14 Nov 2026. Owned by Irfan: edit freely. `/pm` reads this file and only proposes changes to it.

## Now (this quarter, in priority order)

1. **BM and EN content edited side by side.** The last unbuilt editing item in the "Complete builder" phase: an officer can write a page in both languages, and visitors can read either.
   - Done when: an officer can edit a page's EN title and blocks next to the BM ones in the editor; publishing writes the EN version at its own address with a language switch on the published page; the pre-publish checks run on both languages; `test/upgrade.test.ts` still boots and publishes the 1.0 fixture.
   - Evidence: `docs/laman.md` § Constraints (Languages: BM and EN), § Phases 6 ("BM/EN side by side", not marked built) and § Open questions; `PRODUCT.md` § Capabilities ("EN as a second slot"); `locales` in `packages/blocks/src/content.ts`.

2. **A 1.0 release an agency can install without cloning the repo.** The schema is already frozen as 1.0; the release itself doesn't exist yet.
   - Done when: a `v1.0.0` tag and GitHub release exist; a versioned Docker image is published and `docs/install-docker.md` installs and upgrades from it rather than from `git clone`; the release's database is saved with `pnpm --filter @laman/server fixture`; package versions are no longer `0.0.0`; the release and patch policy is written down.
   - Evidence: `docs/install-docker.md` ("there's no published image yet"); `docs/upgrades.md` § Not in this plan (release packaging, image tags, SBOMs, patch policy) and § Saved databases ("`0001_baseline.sql` for 1.0"); no tags or releases on GitHub; `"version": "0.0.0"` in `package.json`.

3. **Native install with systemd.** The second install path the RFC promises, for agencies that don't run Docker.
   - Done when: `laman init` installs the systemd service; data lives in `/var/lib/laman` and backups in `/var/backups/laman` with the documented permissions; the bundled `laman-backup.timer` works with `BACKUP_SCHEDULE=off`; backup, restore and upgrade are documented for a native install the way `docs/install-docker.md` does for Docker.
   - Evidence: `docs/laman.md` § Constraints (Install: Docker image and native), § Native ("Planned with the package (not built yet)") and § Phases 5.

4. **A first-time officer can run the site with no handover.** Test the admin with officers who've never seen it, and fix what they trip on.
   - Done when: three to five officers new to Laman have done walkthroughs A, B and D from `docs/admin-evaluation.md`; the findings are written up in `docs/`; posting an urgent announcement on a phone is timed against the 2-minute target; each blocking finding has an issue.
   - Evidence: `PRODUCT.md` § Evidence on Hand ("No user research, usability tests …"); `docs/project-context.md` § Suggested next steps 1 and § Gaps in this context; `docs/admin-evaluation.md` (closing list, step 8); `docs/journeys/publish-model.md` (2-minute phone target).

## Next

- Bring Azure Blob Storage off-site backups back once a release can test them against a real account (`docs/laman.md` § Azure Blob Storage (parked)).
- MCP resources and prompts: the block catalogue, a content guide, the page tree; "build a page from a brief", "audit the site for accessibility" (`docs/mcp.md` § Resources and prompts (planned)).
- Lighter approval: a shareable, expiring preview link for a draft and an "Approved by" note in history. Proposed, not decided (`PRODUCT.md` § Open decisions, `docs/project-context.md` § Tensions 2).
- Documents as content: show a PDF's size and language beside its link, and offer an HTML alternative (`docs/project-context.md` § Tensions 6, `PRODUCT.md` § Open decisions).
- Message and Video blocks, and the hero's search, tasks and figures add-ons when FTDS ships them (`docs/briefs/hero-variants-and-html-in-canvas.md`).

## Not doing

From the docs, where they rule these out:

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

1. The order of "Now" is a guess (bilingual editing, then the release, then the native install, then user testing). Should the 1.0 release come before BM/EN side by side, so the pilot runs on a tagged build?
2. Is BM and EN side by side still wanted for 1.0? `docs/laman.md` lists it as an open question, and I couldn't tell from the code how much of the EN slot the admin already edits.
3. Is the native systemd install still a 1.0 requirement, or is Docker enough until an agency asks for native?
4. Should each "Now" goal be split into issues labelled `ready` so `/pm` can propose work? There are no open issues today.
