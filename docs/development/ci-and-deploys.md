# CI and Production Deployment Policy

Status: Current
Owner: Platform/release
Last updated: 2026-09-17

## Production invariant

A production mutation must be downstream of a successful `CI` run for the exact
commit being deployed. A branch name is not sufficient evidence because it can
move between validation and deployment.

- Web production is owned by
  `.github/workflows/deploy-production.yml`. It accepts only a successful,
  push-triggered `CI` `workflow_run` for `main` from this repository, checks out
  `workflow_run.head_sha`, builds with the pinned Vercel CLI, and deploys only
  the prebuilt artifact. Its `staging-gate` job holds the promotion until the
  staging run for that same commit has concluded.
- Web staging is owned by `.github/workflows/deploy-staging.yml`, described
  under "Staging tier" below.
- `vercel.json` disables automatic Git deployment for `main`, preventing the
  Vercel Git integration from racing the CI-owned production promotion. Other
  branches retain Vercel preview behavior.
- Signaling production is owned by
  `.github/workflows/deploy-signaling-server.yml`. Its automatic Railway path
  uses the same successful-`CI` and exact-SHA gate. A manual Railway/Fly run
  first queries GitHub for a successful push-triggered `CI` run on the selected
  SHA and fails closed if no such run exists.

The Express API gateway that used to hold the second staging tier was deleted on
2026-08-17. Nothing deploys it and nothing reads its `staging-gateway` or
`production-gateway` environments;
`scripts/founder/provision-deploy-environments.sh` carries the command that
removes them.

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

## Staging tier

`.github/workflows/deploy-staging.yml` owns the web staging tier. It fires on
the same successful, push-triggered `CI` `workflow_run` as production and checks
out the same `workflow_run.head_sha`, so staging and production are the same
commit built the same way, and the only difference between the two is which
environment's values the build was pulled with.

It has no affected-surface filter. Staging tracks `main` commit for commit
because the production gate below waits on it: a staging deploy skipped by a
scope classifier would be a commit production could never promote.

What the run does, in order:

1. Applies every pending migration to the persistent staging database with
   `pnpm db:migrate -- apply --target staging`. That database keeps its state
   between deploys, so a migration meets real rows here before it meets
   production. CI's `database` job proves the same migrations apply to an empty
   Postgres; it cannot prove they apply to data.
2. Builds and deploys the prebuilt artifact with the same pinned Vercel CLI.
3. Aliases the deployment onto the staging origin. The deployment's own
   `*.vercel.app` URL sits behind Deployment Protection and answers 401 to an
   unauthenticated probe, so the smoke check has to run against the custom
   domain.
4. Runs `scripts/verify-deployment.mjs` against that origin and asserts it
   serves this commit, the same verifier and the same serving path the
   production gate uses.
5. Records the deployment at target `staging` in the migration ledger and posts
   a staging deployment summary to the run.

`deploy-production.yml`'s `staging-gate` job then waits for that run's verdict
before `deploy-web` starts. A staging run that fails, is cancelled, or never
completes within 25 minutes stops the promotion. A run whose jobs were all
skipped concludes `skipped`, which is the state while `vars.STAGING_WEB_URL` is
unset, and is the one verdict that lets a promotion through without a staging
deploy: the tier is off until it is provisioned, and turning it on is what makes
the gate real.

## Background components

Every background worker, the scheduler, the queue drain, billing reconciliation,
retention and purge, connector refresh, retrieval indexing, sandbox reclaim and
the health probe, runs as a cron route inside the one Next.js service. There is
no separate worker deployable and no message broker; the queue is Postgres
(`apps/web/db/neon/0208_background_jobs.sql`) with its per-queue policy in
`apps/web/lib/jobs/job-queues.ts`.

`apps/web/app/api/cron/deployable-components.json` is what makes each of them an
independently versioned, releasable component anyway. Every entry carries a
role, a version, a changelog, the queues it produces into or claims from, and
what happens to the work it holds when a deployment replaces it mid-run. That
last field is the compatibility answer a deploy needs: a component recovers
either on the next tick, because its work is bounded and idempotent, or by lease
expiry, because it claimed rows from a queue and a replaced instance simply lets
the lease lapse.

`apps/web/app/api/cron/deployable-components.test.ts` is the gate. It runs in
CI's `js-verify` lane, so it is inside `CI complete` and therefore inside the
production promotion: a cron route with no registry entry, a registry entry with
no route, an unknown queue name, a lease claimed by a component that consumes
nothing, or a version with no changelog entry fails the build. Both deploy
workflows print the roster with its versions into the run summary, so a
deployment record says which component versions it carries.

## Path and cancellation policy

`scripts/production-deploy-scope.mjs` is the shared path classifier:

- Web changes rebuild Web; gateway and signaling-only changes do not.
- Service changes rebuild only the owning service.
- Root dependency/workspace inputs and shared packages select the affected app
  and deployment lanes. They do not rebuild Rust binaries by themselves.
- Rust sources, Cargo inputs, and cross-language sync parity sources select the
  expensive Linux, macOS, and Windows Rust lanes. Desktop changes independently
  select Desktop E2E. Workflow-only, npm wrapper, and Web changes skip Rust.
- Documentation-only changes select no deployment or native lane.

CI and deploy workflows cancel superseded runs on the same branch or production
surface. Priority test workflows run on Linux, use the pnpm cache built into
`actions/setup-node`, and have push path filters. The standalone Desktop E2E
schedule is weekly rather than a duplicate nightly run.

## Runner-minute projection

This repository is public, and GitHub-hosted standard runners are free for
public repositories, so the ceilings below are a wall-clock and
concurrency budget rather than a billing one. They are written for the private
case, which is what a fork or a visibility change would land in: GitHub's
published GitHub Free allowance on 2026-07-30 is 2,000 Actions minutes per
month, and the repository must not assume paid overage.

The workflow timeouts are safety ceilings, not expected durations:

| Change class                  | Always/likely lanes                                                                                              | Maximum allocated runner time |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Docs only                     | Repo-operability/document checks only                                                                            | 15 minutes                    |
| Surface-local Web TypeScript  | Main CI, priority tests when matched, deploy scope, staging deploy on every green main push, Web deploy when Web | 275 Linux minutes             |
| Signaling-only                | Main CI, signaling gate/test/build/deploy/cleanup                                                                | 210 Linux minutes             |
| Native Desktop/CLI/Rust       | Main CI plus Desktop E2E, extended clippy, macOS smoke, and Windows smoke                                        | 495 mixed-OS minutes          |
| Weekly standalone Desktop E2E | One Linux E2E run                                                                                                | 30 minutes/week               |

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

The `staging-web` GitHub environment owns the staging tier, and the tier is off
until all of it exists:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`: the same Vercel project
  as production. Staging is a preview-target deployment of it, not a second
  project, so the artifact promoted to production is the artifact staging built.
- `AGI_STAGING_DATABASE_URL`: the persistent staging database. It is a separate
  Neon database, never a branch of production, because the migrations applied to
  it are the ones not yet applied to production.
- `STAGING_WEB_URL` (variable): the staging origin, a custom domain assigned to
  the Vercel project. Its absence is what keeps the tier and the production
  staging gate dormant.

The Vercel project's preview environment must point at the staging database, or
the deployment will run its migrations against one database and serve another.

`.github/rulesets/environments.json` declares the protection every one of these
environments should carry, and `.github/rulesets/README.md` holds the command
that applies it. Until that runs, an environment's secrets are reachable from
any branch through a `workflow_dispatch`.

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
