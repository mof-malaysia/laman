# Fiscal Sb

A React SPA and a Fastify api in one Turborepo monorepo.

## Getting started

```sh
pnpm install
pnpm dev
```

- Web: http://localhost:3001
- API: http://localhost:3000 (docs at http://localhost:3000/docs)

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

## Configuration

The api reads environment variables, validated in `apps/api/src/env.ts`:

| Variable      | Default     | Meaning                                                             |
| ------------- | ----------- | ------------------------------------------------------------------- |
| `PORT`        | `3000`      | Port to listen on                                                   |
| `HOST`        | `127.0.0.1` | Interface to bind (`0.0.0.0` in Docker)                             |
| `LOG_LEVEL`   | `info`      | Pino log level                                                      |
| `CORS_ORIGIN` | (none)      | Comma-separated origins allowed to call the api from another origin |
| `WEB_DIST`    | (none)      | Folder with the built SPA to serve; set in the Docker image         |

## Checks

A pre-commit hook (lefthook, installed by `pnpm install`) formats staged files with oxfmt, then runs `pnpm check` (lint, type checks and tests through Turborepo). A failure stops the commit.

---

Scaffolded with create-ft-app 0.1.2. See `AGENTS.md` for conventions.
