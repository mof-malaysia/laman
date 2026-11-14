# Roadmap

Owned by Irfan. `/pm` reads this file and only proposes changes to it.

## Now (this quarter, in priority order)

1. TODO: goal, and what "done" looks like

## Next

- TODO

## Not doing

- TODO: things we've decided against, so nobody proposes them again

## Known gaps

- No CI runs `pnpm check` or `pnpm verify` on pull requests; the only gate is the local lefthook pre-commit hook, which a commit from another machine or the GitHub UI skips. `.github/workflows/www.yml` only deploys the marketing site.
- Azure Blob Storage off-site backups are written but parked until a release can test them against real Azure.
- `packages/contracts` has no tests of its own (its schemas are exercised through the server's tests).
