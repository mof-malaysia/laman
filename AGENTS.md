# Working on fiscal-sb

A Turborepo monorepo scaffolded by create-ft-app 0.1.2 with: web, api, contracts, oxlint-config, typescript-config. This file is what you need to change it safely.

## Run it

Node 24 or later (see `.nvmrc`) and pnpm 12.16.1 (`packageManager` in `package.json`). From the repo root:

```sh
pnpm install
pnpm dev                         # every app in watch mode
pnpm build                       # every package, into git-ignored dist/ folders
```

- `pnpm dev` runs the api on :3000 and the web app on :3001. The web dev server proxies `/v1`, `/healthz`, `/docs` and `/openapi.json` to the api, so the browser sees one origin, as it does in the Docker image.
- **Settings are environment variables**, validated at boot in `apps/api/src/env.ts`; the api refuses to start with a clear message when one is wrong. Local values go in `apps/api/.env` (git-ignored; `.env.example` lists them all).
- **Ready check:** `GET /healthz` returns `{"ok":true}`. API docs (Scalar) are at `/docs`, the OpenAPI document at `/openapi.json`.
- Run one package with a filter, e.g. `pnpm --filter @fiscal-sb/api dev`.

## Where things live

| Path                               | What                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                         | React SPA: Rsbuild, TanStack Router (code-based routes in `src/router.tsx`) and TanStack Query, FTDS components      |
| `apps/web/src/i18n/messages/en.ts` | Every user-facing string, read with `t()`                                                                            |
| `apps/api`                         | Fastify api: `src/app.ts` builds the app, `src/routes/` has one module per resource, `src/errors.ts` the error shape |
| `packages/contracts`               | Valibot schemas and types shared by web and api: the wire contract                                                   |
| `packages/typescript-config`       | tsconfig presets: `base`, `node`, `library`, `react`                                                                 |
| `packages/oxlint-config`           | Oxlint presets: `base`, `node`, `react`                                                                              |
| `pnpm-workspace.yaml`              | Workspace packages and the **catalog**: the one place third-party versions live                                      |

## Rules that aren't obvious from the code

- **Versions live in the catalog.** Add a dependency to `catalog:` in `pnpm-workspace.yaml` and write `"<name>": "catalog:"` in the package.json. Don't put version ranges in package.json files. Renovate keeps the catalog current.
- **Workspace packages are `@fiscal-sb/<name>`** and referenced as `"workspace:*"`.
- **Contract changes go everywhere at once:** the schema in `packages/contracts`, the api route that uses it, and the web code that reads it. The api turns the same Valibot schemas into its OpenAPI document.
- **Errors have one shape:** `{ "error": { "code": "snake_case", "message": "…" } }`; successful responses wrap their payload in `{ "data": … }`. Throw `new HttpError(status, code, message)` from `src/errors.ts`.
- **Routes declare Valibot schemas** (`schema: { querystring: HelloQuery }`). Fastify validates with Valibot (`src/validation.ts`), and the same schemas become the OpenAPI document.
- **The UI is built on [FTDS](https://mof-malaysia.github.io/ftds/llms.txt)** (Base UI, Tailwind v4), pinned to v0.1.1 in `apps/web/components.json`. Add a component with `pnpm dlx shadcn@latest add @ftds/<name>` from `apps/web`. Use FTDS before writing your own; build anything missing from FTDS tokens (`bg-bg-*`, `text-txt-*`, `border-otl-*`), never raw Tailwind colours or `dark:` overrides. Files under `src/components/ui`, `src/components/blocks`, `src/lib/ftds` and `styles/ftds.css` stay as the registry ships them (oxfmt and Oxlint skip them) so upgrades diff cleanly.
- **UI text goes through `t()`** with a key in `src/i18n/messages/en.ts`; the type checker rejects missing keys.
- **Never commit** `.env` files (only `.env.example`) or `.claude/`. Stage paths explicitly rather than `git add -A`.

## Before calling a change done

The pre-commit hook formats staged files and runs `pnpm check` (lint, type checks, tests); it is the project's gate, so don't bypass it with `--no-verify`. Before handing work over, also build:

```sh
pnpm format
pnpm verify                      # lint, check-types, test, build
```

For UI changes, also look at the result in a browser (`pnpm dev`).
