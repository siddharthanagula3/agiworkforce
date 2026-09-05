# CI and Production Deployment Policy

Status: Current
Owner: Platform/release
Last updated: 2026-07-30

## Production invariant

A production mutation must be downstream of a successful `CI` run for the exact
commit being deployed. A branch name is not sufficient evidence because it can
move between validation and deployment.

- Web production is owned by
  `.github/workflows/deploy-production.yml`. It accepts only a successful,
  push-triggered `CI` `workflow_run` for `main` from this repository, checks out
  `workflow_run.head_sha`, builds with the pinned Vercel CLI, and deploys only
  the prebuilt artifact.
- `vercel.json` disables automatic Git deployment for `main`, preventing the
  Vercel Git integration from racing the CI-owned production promotion. Other
  branches retain Vercel preview behavior.
- Signaling production is owned by
  `.github/workflows/deploy-signaling-server.yml`. Its automatic Railway path
  uses the same successful-`CI` and exact-SHA gate. A manual Railway/Fly run
  first queries GitHub for a successful push-triggered `CI` run on the selected
  SHA and fails closed if no such run exists.
- API gateway staging and production are owned by
  `.github/workflows/deploy-production.yml`. After the same exact-SHA gate it
  builds one `linux/amd64` image, deploys and probes it in staging, then promotes
  the identical registry digest to production. Production first verifies the
  migration ledger without applying or baselining schema.

The former local environment-push and global Fly setup helpers were deleted;
neither is a deployment path. Production environment values belong in the
protected Vercel/GitHub environments, and changing them does not implicitly
redeploy an unverified worktree.

## Negative guarantee

A failed, cancelled, skipped, or neutral upstream `CI` run cannot allocate a
production deployment job:

1. GitHub emits the `workflow_run` completion event.
2. The workflow checks `conclusion == 'success'`, `event == 'push'`,
   `head_branch == 'main'`, and same-repository ownership before checkout.
3. The affected-surface classifier runs only for an eligible upstream result.
4. Production jobs require the classifier output and deploy the immutable
   upstream `head_sha`.

`pnpm check:ci-guardrails` tests this negative contract and also rejects a
re-enabled Vercel `main` auto-deploy.

## Path and cancellation policy

`scripts/production-deploy-scope.mjs` is the shared path classifier:

- Web changes rebuild Web; gateway and signaling-only changes do not.
- Service changes rebuild only the owning service.
- Root dependency/workspace inputs and shared packages conservatively select
  every consumer.
- Native Rust work selects the expensive Linux, macOS, Windows, and Desktop E2E
  lanes; Web-only changes skip them.
- Documentation-only changes select no deployment or native lane.

CI and deploy workflows cancel superseded runs on the same branch or production
surface. Priority test workflows run on Linux, use the pnpm cache built into
`actions/setup-node`, and have push path filters. The standalone Desktop E2E
schedule is weekly rather than a duplicate nightly run.

## Runner-minute projection

This repository is private. GitHub's published GitHub Free allowance on
2026-07-30 is 2,000 Actions minutes per month; public repositories and
self-hosted standard runners are free. The repository must not assume paid
overage.

The workflow timeouts are safety ceilings, not expected durations:

| Change class                            | Always/likely lanes                                                       | Maximum allocated runner time |
| --------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Docs only                               | Repo-operability/document checks only                                     | 15 minutes                    |
| Surface-local Web or gateway TypeScript | Main CI, priority tests when matched, deploy scope, Web deploy when Web   | 245 Linux minutes             |
| Signaling-only                          | Main CI, signaling gate/test/build/deploy/cleanup                         | 210 Linux minutes             |
| Native Desktop/CLI/Rust                 | Main CI plus Desktop E2E, extended clippy, macOS smoke, and Windows smoke | 495 mixed-OS minutes          |
| Weekly standalone Desktop E2E           | One Linux E2E run                                                         | 30 minutes/week               |

The mixed-OS ceiling is intentionally exceptional; macOS and Windows have
higher paid per-minute rates than Linux. Normal Web/service work no longer
allocates those runners. At the Free allowance, eight worst-case Web changes or
four worst-case native changes in a month would exceed the raw ceiling, so
superseded commits must be cancelled and changes should land through reviewed,
batched pull requests.

GitHub's billing dashboard is the operational source for actual usage. Enable
the 90% and 100% included-usage alerts and configure a zero-overage budget. On
2026-07-30 the latest repository runs were ending before a runner or step was
allocated; the available token cannot read the account billing endpoint, so an
account owner must confirm the Actions allowance/payment/budget state before a
live deployment demonstration.

## Required protected configuration

The `production-web` GitHub environment owns:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Vercel owns the application runtime values pulled by `vercel pull`. Railway and
Fly secrets stay in their existing protected production environments. No
workflow prints secret values.

The gateway uses two protected GitHub environments:

- `staging-gateway`: `FLY_API_TOKEN` plus
  `FLY_GATEWAY_STAGING_APP` and `GATEWAY_STAGING_URL` variables.
- `production-gateway`: `FLY_API_TOKEN`, read-only deployment
  `AGI_DATABASE_URL`, plus `FLY_GATEWAY_PRODUCTION_APP` and
  `GATEWAY_PRODUCTION_URL` variables.

Runtime gateway secrets live on each Fly app. Staging and production must be in
the same Fly organization because production pulls the staging-tested private
registry digest. Both remain at one machine until the pending WebSocket command
state and scheduling durability ticket passes its two-replica proof.

## Local fast gate

`.husky/pre-push` delegates to `scripts/prepush-clean-worktree.sh`, which judges
the commits being pushed rather than the shared working tree. It creates a
detached linked worktree of `HEAD` under a temp directory
(`AGI_PREPUSH_WORKTREE_PARENT` to override, default
`${TMPDIR:-/tmp}/agi-prepush-worktree`), symlinks each workspace package's
`node_modules` contents into it, runs the guard chain there, then removes the
worktree on every exit path. A guard that reads `git ls-files -co
--exclude-standard` (AGENTS.md §12) sees only what is in `HEAD`, so an
uncommitted or untracked file elsewhere in the shared tree can no longer block
someone else's push; CI enforces the same chain against the same commits.

The chain and diff commands are overridable
(`AGI_PREPUSH_CHAIN_CMD`, `AGI_PREPUSH_DIFF_CMD`, `AGI_PREPUSH_DIFF_CACHED_CMD`)
for testing; the real hook runs the defaults:

```bash
pnpm check:llm-operability
git diff --check
git diff --cached --check
```

`AGI_PREPUSH_ON_TREE=1` restores the previous behavior, running the same three
commands directly against the working tree. `SKIP_PRE_PUSH=1` remains an
emergency-only escape hatch and must be disclosed in the pull request or
handoff.
