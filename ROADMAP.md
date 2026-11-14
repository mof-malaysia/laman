# Roadmap

Owned by Irfan. `/pm` reads this file and only proposes changes to it.

## Now (this quarter, in priority order)

1. TODO: goal, and what "done" looks like

## Next

- TODO

## Not doing

- **BM and EN site content (KIV).** A site has one default language, now and for the foreseeable future. No second-language slot, side-by-side BM/EN editing or language switcher on published sites. Kept in view, not planned.
- **Native (systemd) installs.** Laman installs as a container only (Docker image, `compose.yaml`). No `init` that installs a systemd unit, no bundled `laman-backup.timer`, no native install guide.

## Known gaps

- No CI runs `pnpm check` or `pnpm verify` (by choice, to save GitHub Actions minutes); the gate is the local lefthook hooks, `pnpm check` before commit and `pnpm verify` before push, which a commit from another machine without hooks or the GitHub UI skips. `.github/workflows/www.yml` only deploys the marketing site.
- Azure Blob Storage off-site backups are written but parked until a release can test them against real Azure.
- `packages/contracts` has no tests of its own (its schemas are exercised through the server's tests).
