# Working on fiscal-sb

A Turborepo monorepo, scaffolded by create-ft-app 0.1.2, holding the FTDS Site Builder: the design is in `docs/site-builder.md`. This file is what you need to change it safely.

## Run it

Node 24 or later (see `.nvmrc`) and pnpm 12.16.1 (`packageManager` in `package.json`). From the repo root:

```sh
pnpm install
pnpm dev                         # every app in watch mode
pnpm build                       # every package, into git-ignored dist/ folders
```

- `pnpm dev` runs the server on :3000 and the admin on :3001/admin. The admin dev server proxies `/api`, `/render`, `/_astro`, `/media`, `/healthz`, `/docs`, `/openapi.json`, `/pagefind` and `/carian` to the server, so the browser sees one origin, as it does when the server serves the built admin. The published site is at :3000/.
- **The renderer is built, not watched.** The server imports `apps/renderer/dist`; after changing anything in `apps/renderer`, run `pnpm --filter @fiscal-sb/renderer build` (the dev server picks it up).
- **Settings are environment variables**, validated at boot in `apps/server/src/env.ts`; the server refuses to start with a clear message when one is wrong. Local values go in `apps/server/.env` (git-ignored; `.env.example` lists them all).
- **State is `DATA_DIR`** (`apps/server/data/` in development, git-ignored): `site.db` (SQLite, WAL) and `public/`, the published site. Delete the folder to start again; a new database starts with a home page.
- **Ready check:** `GET /healthz` returns `{"ok":true}`. API docs (Scalar) are at `/docs`, the OpenAPI document at `/openapi.json`.
- Run one package with a filter, e.g. `pnpm --filter @fiscal-sb/server dev`.

## Where things live

| Path                                 | What                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/blocks`                    | The block registry: one Zod schema per block (`src/blocks/`), the page model, rich text and its allow-list HTML writer. Validation, rendering and the property panel all read it |
| `packages/contracts`                 | Zod schemas and types for the API: the wire contract between server and admin                                                                                                    |
| `apps/renderer`                      | Astro in middleware mode: block tree in, HTML out, with the FTDS Astro components. `src/blocks/` maps each block type to its component and adds the edit hooks                   |
| `apps/server`                        | Fastify, one process: the API (`src/routes/`), Kysely over SQLite (`src/db/`), content (`src/content/`), the job queue, the publisher, the CLI (`src/cli.ts`)                    |
| `apps/admin`                         | React SPA at `/admin`: Rsbuild, TanStack Router (`src/router.tsx`) and Query, FTDS. The editor is in `src/editor/`                                                               |
| `apps/admin/src/i18n/messages/en.ts` | Every user-facing string of the admin, read with `t()`                                                                                                                           |
| `packages/typescript-config`         | tsconfig presets: `base`, `node`, `library`, `react`                                                                                                                             |
| `packages/oxlint-config`             | Oxlint presets: `base`, `node`, `react`                                                                                                                                          |
| `pnpm-workspace.yaml`                | Workspace packages and the **catalog**: the one place third-party versions live                                                                                                  |

## Rules that aren't obvious from the code

- **Versions live in the catalog.** Add a dependency to `catalog:` in `pnpm-workspace.yaml` and write `"<name>": "catalog:"` in the package.json. Don't put version ranges in package.json files. Renovate keeps the catalog current.
- **Workspace packages are `@fiscal-sb/<name>`** and referenced as `"workspace:*"`.
- **A new block touches three places:** its schema in `packages/blocks/src/blocks/` (listed in `registry.ts`, with its palette `group`, `icon` and the page `kinds` it may be placed on), its wrapper in `apps/renderer/src/blocks/` (listed in `Block.astro`), and nothing in the admin: the palette and property panel come from the registry. Field builders in `fields.ts` (`field.text`, `field.select`, `field.media`, `field.toggle`, `field.page`, …) carry the panel metadata; text fields marked `inline` get a `<Field>` in the wrapper so they can be edited on the canvas. The registry test renders every block's defaults, and every template in `templates.ts`, through the schemas.
- **Pages have kinds:** `page`, `listing` (collects dated entries) and `entry` (an article under a listing). The API rejects blocks a kind can't use. Entries' fixed fields live in the draft (`PageDocument.entry`), so they publish and roll back with it.
- **Site settings and navigation are drafted documents** (`packages/contracts/src/site.ts`), like pages: saving writes the draft, publishing makes it live.
- **Site colours change only the `--_primary-*` primitives**, written by the layout from the `theme` document (`packages/blocks/src/theme.ts`, `docs/site-builder.md` § Site colours). Components keep using semantic tokens, so they follow; never hard-code a primary shade.
- **Block content is data, never HTML.** Links go through `Href` (no `javascript:`); rich text is Tiptap JSON written out by `richTextToHtml`, an allow-list.
- **Contract changes go everywhere at once:** the schema in `packages/contracts` or `packages/blocks`, the server route that uses it, and the admin code that reads it. The server turns the same Zod schemas into its OpenAPI document.
- **Only the API writes.** The admin changes content through `/api`; the canvas (`/render`) only reads.
- **Analytics live in their own database** (`DATA_DIR/analytics.db`, migrations in `apps/server/src/analytics/db.ts`). `POST /_v` is the one builder path the public site calls; it always answers 204. Nothing that identifies a visitor across days is stored: see `docs/analytics.md` before changing what's collected.
- **Errors have one shape:** `{ "error": { "code": "snake_case", "message": "…" } }`; successful responses wrap their payload in `{ "data": … }`. Throw `new HttpError(status, code, message)` from `src/errors.ts`.
- **Routes declare Zod schemas** (`schema: { params: PageParams }`). Fastify validates with Zod (`src/validation.ts`), and the same schemas become the OpenAPI document.
- **Migrations are append-only** (`apps/server/src/db/migrations.ts`) and run on every start.
- **The UI is built on [FTDS](https://mof-malaysia.github.io/ftds/llms.txt)** v0.2.0 (Base UI, Tailwind v4). In the admin, add a component with `pnpm dlx shadcn@latest add @ftds/<name>` from `apps/admin`. In the renderer, the shadcn CLI can't install `.astro` files yet: use `node scripts/ftds-add.mjs astro-<name>` from `apps/renderer`. Use FTDS before writing your own; build anything missing from FTDS tokens (`bg-bg-*`, `text-txt-*`, `border-otl-*`), never raw Tailwind colours or `dark:` overrides. Files under `src/components/ui`, `src/components/blocks`, `src/lib/ftds` and `styles/ftds.css` stay as the registry ships them (oxfmt and Oxlint skip them) so upgrades diff cleanly.
- **UI text goes through `t()`** with a key in `src/i18n/messages/en.ts`; the type checker rejects missing keys. Site content and the FTDS Astro labels are BM by default.
- **Never commit** `.env` files (only `.env.example`), `data/` or `.claude/`. Stage paths explicitly rather than `git add -A`.

## Before calling a change done

The pre-commit hook formats staged files and runs `pnpm check` (lint, type checks, tests); it is the project's gate, so don't bypass it with `--no-verify`. Before handing work over, also build:

```sh
pnpm format
pnpm verify                      # lint, check-types, test, build
```

For UI changes, also look at the result in a browser (`pnpm dev`).
