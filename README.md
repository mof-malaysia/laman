<p align="center">
  <img src="docs/logo.svg" alt="Laman logo" width="88" height="88">
</p>

<h1 align="center">Laman</h1>

A self-hosted website builder for agency sites, built on FTDS. Editors arrange approved FTDS blocks on a live canvas, edit text in place and press Publish to write a static site. One Node process, one SQLite file. The design is in [docs/site-builder.md](docs/site-builder.md).

## Install on a server

With Docker Compose, from this repository:

```sh
cp .env.example .env    # then fill it in
docker compose --profile https up -d --build
```

That's the builder and Caddy for HTTPS; without `--profile https` it listens on `127.0.0.1:8080` for your own proxy. The full guide, with backups, restore and upgrades, is [docs/install-docker.md](docs/install-docker.md).

## Develop

```sh
pnpm install
pnpm dev
```

- Admin and editor: http://localhost:3001/admin
- Server: http://localhost:3000. It serves the API (`/api`, docs at `/docs`), the canvas (`/render`) and the published site at `/`.

State lives in `apps/server/data/` (git-ignored): `site.db` and the published site in `public/`. A new install starts with a home page.

## Scripts

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | Run every app in watch mode                              |
| `pnpm build`       | Build every package                                      |
| `pnpm lint`        | Oxlint                                                   |
| `pnpm check-types` | TypeScript, no emit                                      |
| `pnpm test`        | Rstest                                                   |
| `pnpm format`      | oxfmt                                                    |
| `pnpm check`       | Lint, type check and test: what the pre-commit hook runs |
| `pnpm verify`      | `check` plus build                                       |

The server's CLI runs the same code: `pnpm --filter @fiscal-sb/server cli migrate` creates or upgrades the database, and `… cli publish` rebuilds the published site.

## Configuration

The server reads environment variables, validated in `apps/server/src/env.ts`; `apps/server/.env.example` lists every one with what it does (the port, the data and backup folders, the site's address, the proxy, the first account, analytics). Locally they go in `apps/server/.env`; with Docker, in `.env` beside `compose.yaml`.

In development, the admin's dev server reads `ADMIN_PORT` (default `3001`) and `SERVER_URL` (default `http://127.0.0.1:3000`).

## Checks

A pre-commit hook (lefthook, installed by `pnpm install`) formats staged files with oxfmt, then runs `pnpm check` (lint, type checks and tests through Turborepo). A failure stops the commit.

---

Scaffolded with create-ft-app 0.1.2. See `AGENTS.md` for conventions.
