# CONTRIBUTING.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-08-28

`AGENTS.md` is the operating contract and applies to humans too. This file
covers the mechanics of getting a change in.

## Setup

Node 24, pnpm 9.15.3, Rust 1.94.0 (pinned in `rust-toolchain.toml` and kept in
lockstep with CI). Then:

```bash
pnpm install
```

`docs/agent-context/commands.json` is the machine-readable inventory of every
per-surface command. Read it rather than guessing a workspace filter name.

## Before you push

```bash
pnpm lint
pnpm typecheck:all          # NODE_OPTIONS=--max-old-space-size=8192 for apps/web
pnpm test:affected
pnpm check:llm-operability  # what .husky/pre-push runs
```

The guard chain is `&&`, so it stops at the first failure and hides every later
one. When something is red, run the individual `check:*` script rather than
re-running the chain.

Guards read the working tree, not `HEAD`. Stage your change first, then run
them, or you will validate something you did not commit.

## Commits

Conventional and **lowercase** subjects. `commitlint` rejects any capitalized
token in the subject line, filenames included, put those in the body.

```
fix(web): stop the composer dropping a queued attachment
```

Keep a change reviewable: separate structural moves from content rewrites, and
do not bundle unrelated product work into a refactor.

Never hand-edit `pnpm-lock.yaml` or `Cargo.lock`. Change the manifest and run
the package manager.

## Adding files

New root files must be registered in `scripts/check-repo-organization.mjs` or
the guard rejects them. New documentation goes to the owner named in the
`AGENTS.md` §11 table, if a document does not fit a row, settle ownership
before writing it.

Generated artifacts are never hand-edited. Each has a generator and a drift
check; run the generator.

## Pull requests

`.github/PULL_REQUEST_TEMPLATE/` holds templates per change type. State what you
ran, not just what you changed, a claim of success without a command behind it
is treated as unverified.

## Reporting a vulnerability

See `SECURITY.md`. Do not open a public issue for a security report.
