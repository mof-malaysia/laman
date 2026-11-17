# Releases: versions, the image and the patch policy

Status: decided (issue #16), not yet used: there is no tag yet. The workflow that publishes the image is `.github/workflows/release.yml` (#17); the install guide that pulls it is [install-docker.md](install-docker.md) (#18).

An agency installs Laman as a Docker image and upgrades by changing one version number. This page says what a version number promises, what the image carries, and how a release is made. What keeps stored content readable across versions is in [upgrades.md](upgrades.md).

## Decisions

| Question                        | Decision                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Where is the image published?   | GitHub Container Registry, `ghcr.io/mof-malaysia/laman`, pushed by the release workflow with its own `GITHUB_TOKEN` |
| Which tags does an image get?   | A stable release: `X.Y.Z`, `X.Y`, `X` and `latest`. A pre-release (`-beta.N`, `-rc.N`): only its exact version      |
| Which platforms?                | `linux/amd64` only. `linux/arm64` is added when an agency asks for it                                               |
| Supply-chain extras             | BuildKit's SBOM and provenance attestations on every image. Signing (cosign) is deferred                            |
| How does an install pin it?     | `LAMAN_VERSION` in the Compose `.env`, set to an exact version. Only `compose.yaml` reads it; the server never does |
| Version scheme                  | SemVer, read from an operator's side (below). One version for the whole repository                                  |
| Which versions get fixes?       | Only the latest minor, while installs are few                                                                       |
| The road to 1.0                 | `v1.0.0-beta.N`, then optionally `v1.0.0-rc.N`, then `v1.0.0`                                                       |
| Can a beta install reach 1.0.0? | Yes for its data: migrations run and backups restore. Nothing else is promised                                      |
| The 1.0 saved database          | Both fixtures are deleted and saved again from the 1.0.0 build, in the final 1.0.0 prep PR, not in a beta           |
| Who does what at release time   | An agent prepares everything up to "ready to tag". Irfan pushes the tag and publishes the draft release             |

## Versions

One version number for the whole repository: the root `package.json` and every workspace `package.json` (`apps/*`, `packages/*`) carry the same `version`. The server reports `apps/server/package.json`'s, which is what an operator sees: in each backup's `manifest.json`, the admin summary (`GET /api/summary`) and the MCP server's `serverInfo`. A tag is `v` followed by that version (`v1.0.0`, `v1.2.3`, `v1.0.0-beta.2`), and the release workflow refuses a tag that doesn't match it.

Pre-release suffixes follow SemVer's order: `1.0.0-beta.1` < `1.0.0-beta.2` < `1.0.0-rc.1` < `1.0.0`. `1.0-beta` is not a valid version; a pre-release always has all three numbers and a numbered suffix.

### What each kind of release may change

SemVer, read from the side of an agency running an install:

| Release         | May contain                                                                                                                                        | Never                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Patch (`1.0.1`) | Fixes only. No new migration, unless a fix can't be made without one; the release notes then say so                                                | New features, new required settings                                                                           |
| Minor (`1.1.0`) | Features, new migrations, new optional settings, new CLI commands, API fields and MCP tools                                                        | Removing or renaming an environment variable, a CLI command or flag, an `/api` field or route, or an MCP tool |
| Major (`2.0.0`) | Anything that breaks an install: a removed setting, command or API field, a required manual step on upgrade, a database older installs can't reach | —                                                                                                             |

A migration is never a breaking change by itself: it runs at boot, after a backup, and puts the database back if it fails ([upgrades.md](upgrades.md) § 2).

### Which versions get fixes

Only the latest minor. A fix lands on `main` and ships in the next patch of the current minor; an agency on an older minor upgrades to get it. This holds while installs are few, and is revisited when agencies need longer.

A patch is tagged from `main` when `main` has nothing unreleased beyond the fix. When it does (features waiting for the next minor), the patch is cut from a `release/X.Y` branch made from the last `vX.Y.Z` tag, with the fix brought over by a PR into that branch.

## The image

`ghcr.io/mof-malaysia/laman`, built from the root `Dockerfile` by `.github/workflows/release.yml` when a `v*.*.*` tag is pushed:

- **Tags.** Every image gets its exact version (`1.2.3`, `1.0.0-beta.2`). A stable release also moves `1.2`, `1` and `latest`. A pre-release moves none of them, so nobody following `1` or `latest` lands on a beta or a release candidate.
- **Platform.** `linux/amd64`. `better-sqlite3` and `sharp` are native modules, and an arm64 image built under QEMU would ship them untested; it's added when an agency asks, with a way to test it.
- **Attestations.** An SBOM and SLSA provenance, attached to the image by BuildKit (`docker buildx imagetools inspect ghcr.io/mof-malaysia/laman:<version> --format '{{ json .SBOM }}'`). Image signing is deferred.
- **Labels.** OCI labels for the version, the commit (`revision`), the source repository and the licence.
- **Before it's pushed**, the workflow boots the image as `compose.yaml` runs it, with a throwaway `/data`, waits for `/healthz` and runs `laman check` inside it. This checks the artefact; the tests themselves ran in the pre-push hook.
- **The release.** The workflow then creates a **draft** GitHub release for the tag (marked as a pre-release when the tag has a suffix), with `compose.yaml` and `.env.example` attached, so an install needs no clone.

The package is made public once, by hand, after the first push.

### Pinning a version

An install sets the version in the Compose `.env`:

```sh
LAMAN_VERSION=1.0.0
```

`compose.yaml` pulls `ghcr.io/mof-malaysia/laman:${LAMAN_VERSION}` and refuses to start without it. Pin an exact version, never `latest` or `1`: an upgrade then happens when the agency decides, after reading the release notes, and always runs with a fresh pre-upgrade backup.

## Upgrading and going back

- **Upgrading.** Read the release notes, change `LAMAN_VERSION`, then `docker compose pull && docker compose up -d` ([install-docker.md](install-docker.md) § 6). The new version backs up the database, migrates it and checks every stored document before it listens; if anything fails it puts the database back and exits.
- **Skipping versions.** Any 1.x upgrades directly to any later 1.x. Migrations are append-only and run in order, and every release's saved database is booted by every later build (`test/upgrade.test.ts`), so there is no "upgrade through 1.3 first".
- **Going back.** Set `LAMAN_VERSION` to the previous version. If the newer version ran no migration, that's all. If it did, the older version refuses to open the database ("upgraded by a newer version of Laman"): restore the database-only archive the upgrade wrote to `BACKUP_DIR` just before migrating (`laman restore <archive>`, server stopped). Edits made since the upgrade are lost, so go back soon or not at all.
- **Majors** say in their release notes what has to be done by hand, and are the only releases that may need it.

## Pre-releases and the road to 1.0

1.0 goes through betas, so usability testing runs on a build agencies could install and its findings land in 1.0:

1. `v1.0.0-beta.1`, then `-beta.2`, … as fixes land. Usability sessions and early installs run on these.
2. Optionally `v1.0.0-rc.1` (`-rc.2`, …) once the findings that block 1.0 are fixed, to check the final build without new changes.
3. `v1.0.0`.

A pre-release goes through the same checklist and workflow as a stable release. It gets only its exact image tag, and its GitHub release is marked as a pre-release.

**A beta install can upgrade to 1.0.0, for its data.** Betas run migrations like any release, and the schema is already 1.0's (`0001_baseline`), so a tester's or early agency's pages, media, accounts and settings carry over: from the first beta tag on, a stored-content change between betas ships with a migration ([upgrades.md](upgrades.md) § The rule), and a beta's backups restore into 1.0.0. Nothing else is promised between pre-releases: settings, CLI commands, `/api` fields and MCP tools may still change before 1.0.0 without a major, and the 1.0.0 release notes list what did.

The saved databases are the one exception to "every release adds one": the fixtures saved before the betas (`0001_baseline.sql`, `analytics-0001_baseline.sql`) predate stored documents 1.0 has, so they are deleted and saved again from the 1.0.0 build, in the final 1.0.0 prep PR. No beta saves one. From 1.0.0 on, a saved database is never edited or made again.

## Who does what

- **An agent (or anyone preparing it)** does everything up to "ready to tag" in a PR: versions, saved databases, the release notes, the checks, and the exact commands to tag.
- **Irfan** merges that PR, pushes the tag, checks the workflow run, then edits and publishes the draft release. Nothing is published, and no image is tagged `latest`, without him.

## Release checklist

On a branch `chore/release-<version>` from `main` (or from `release/X.Y` for a patch, above):

1. **Version.** Set `version` to the new version in the root `package.json` and every `package.json` under `apps/` and `packages/`. `git grep -n '"version": "<old version>"'` finds none left.
2. **Saved databases.**
   - For `1.0.0` only: delete `apps/server/test/fixtures/0001_baseline.sql` and `analytics-0001_baseline.sql`, then run `pnpm --filter @laman/server fixture`. Not for a beta or a release candidate.
   - For any later release that added a migration: run `pnpm --filter @laman/server fixture`, which saves the databases under the new last migration's name. A release without a new migration has nothing to save (the script says they're already saved).
   - Commit the new files; never edit an existing one.
3. **Schema changes.** Every stored-document schema change since the last tag was decided on when its PR updated the schema snapshot (`test/upgrade.test.ts`). Check `git log <last tag>..HEAD -- apps/server/test/__snapshots__` and that each one has its migration where it needed one.
4. **Checks.** `pnpm format`, then `pnpm verify` (lint, type checks, tests, build: the pre-push hook runs it again).
5. **The image, locally.** `docker build -t ghcr.io/mof-malaysia/laman:<version> .`, then boot it with a throwaway `/data` and the `SUPER_ADMIN_*` and `SITE_URL` settings, wait for `/healthz` to answer `{"ok":true}`, and run `laman check` inside it. Signed in, `GET /api/summary` reports the new version. Optionally run the release workflow by hand (`workflow_dispatch`), which builds and smoke-tests without pushing.
6. **Release notes**, drafted in the PR description, for the GitHub release:
   - what's new and what's fixed, for officers and for operators;
   - new migrations (and, for a patch, why one was needed);
   - new or changed settings in `.env`, CLI commands, `/api` fields and MCP tools;
   - anything to do on upgrade, and how to go back;
   - for a pre-release, who it's for and the known gaps that affect them (`ROADMAP.md` § Known gaps).
7. **Ready to tag.** The PR ends with "Ready to tag `v<version>`" and the commands below, with the version filled in.

Then Irfan:

1. Merges the PR, then tags the merge commit and pushes the tag:

   ```sh
   git switch main && git pull
   git tag -a v<version> -m "Laman <version>"
   git push origin v<version>
   ```

   The workflow checks the tag against the versions, builds, smoke-tests and pushes the image, and creates the draft release.

2. Checks the run, pastes the notes into the draft release and publishes it. The first time only: makes the `laman` package public in the organisation's GitHub packages.
