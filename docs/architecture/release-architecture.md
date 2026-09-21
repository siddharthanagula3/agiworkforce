# Release architecture

Status: Current
Owner: Platform lead
Last updated: 2026-09-20

What is deployable, in what order, from what artifact, with what credential, and
what happens when a release is wrong. The policy behind the web gate is
`docs/development/ci-and-deploys.md` and the rollback procedure is
`docs/runbooks/release-rollback.md`; this file is the shape of the whole thing,
so nobody has to reconstruct it from seven workflow files.

Every fact here is read from `.github/workflows/` and the registries those
workflows use. Where a surface has no path for something, the row says so.

## 1. Deployable components

| Component          | Released by                                      | Trigger            | Artifact                                   |
| ------------------ | ------------------------------------------------ | ------------------ | ------------------------------------------ |
| Web application    | `.github/workflows/deploy-production.yml`        | Green CI on `main` | A Vercel deployment of one commit          |
| Artifact sandbox   | The same workflow, as a separate surface         | Green CI on `main` | A second Vercel deployment                 |
| Staging web        | `.github/workflows/deploy-staging.yml`           | Green CI on `main` | The same artifact, promoted first          |
| CLI                | `.github/workflows/release-cli.yml`              | Tag `v-cli-*`      | Published package and binaries             |
| Desktop            | `.github/workflows/release-desktop.yml`          | Tag `v-desktop-*`  | Signed Tauri bundles                       |
| Mobile             | `.github/workflows/release-mobile.yml`           | Tag `v-mobile-*`   | Store builds through Expo                  |
| VS Code extension  | `.github/workflows/release-vscode-extension.yml` | Tag `v-vscode-*`   | A vsix                                     |
| Chrome extension   | `.github/workflows/release-chrome-extension.yml` | Tag `v-ext-*`      | A packaged extension                       |
| Signaling server   | `.github/workflows/deploy-signaling-server.yml`  | Its own workflow   | A Fly.io deployment                        |
| Background workers | Deployed with the web application                | Green CI on `main` | Cron routes inside the one Next.js service |

Background workers are the one that surprises people. Every scheduled job is a
cron route inside the web service rather than a standalone deployable, and
`apps/web/app/api/cron/deployable-components.json` is what makes each one
independently versioned anyway: a name, a role, a version with a changelog, the
queues it produces into or claims from, and what happens to work it holds when
a deployment replaces it mid-run. `deployable-components.test.ts` fails the
build on an unregistered route, an unknown queue, an unanswered in-flight
contract, or a version with no changelog entry.

## 2. Environments

| Tier       | What it is                                    | Database                                      | Who reaches it                      |
| ---------- | --------------------------------------------- | --------------------------------------------- | ----------------------------------- |
| Preview    | One deployment per pull request               | Not migrated by the deploy workflows          | Behind Vercel Deployment Protection |
| Staging    | A persistent tier production promotes through | A persistent staging database, migrated first | The staging origin                  |
| Production | The apex, `https://agiworkforce.com`          | The production database                       | Everyone                            |

Staging is not decorative. `deploy-staging.yml` takes the same commit under the
same exact-SHA CI gate, applies the pending migrations to a persistent staging
database, probes the staging origin, and publishes a `staging-web` commit
status. `deploy-production.yml` waits for that status, so an artifact reaches
production only after the identical artifact served staging. Staging has no
affected-surface filter, because a staging deploy a scope filter skipped would
be a commit production could never promote.

## 3. Release ordering

1. CI goes green on the exact commit. Nothing downstream evaluates without it.
2. `deploy-staging.yml` applies pending migrations to staging, deploys, probes,
   and publishes `staging-web`.
3. `deploy-production.yml` selects the affected surfaces, waits for that
   status, verifies the migration ledger with `pnpm db:migrate -- verify`,
   deploys, verifies the serving path, and records the migration state the
   deployment serves.
4. Client surfaces are released independently, by tag. They are not ordered
   against the web deploy, which is why section 5 matters.

The production concurrency group is `production-surfaces` with
`cancel-in-progress: false`. Promotions queue rather than cancel, because a
cancelled run is not a failed run: `failure()` would be false and the rollback
step would never fire, leaving a rejected build promoted with nothing to revert
it.

## 4. Rollback ordering

Rollback is the reverse of deployment in one respect only: code goes back, the
database does not.

1. Roll the code back first. `workflow_dispatch` on `deploy-production.yml`
   with `rollback: true` and a required `rollback_reason` runs
   `scripts/release/rollback.mjs`, which resolves the last ready deployment
   before the one serving, requests the rollback, appends to the release audit
   trail, and then re-verifies the serving path.
2. Do not roll the database back. A migration that has run has run; the
   forward-fix is a new migration. `docs/runbooks/release-rollback.md` section
   "What the rollback does not do" is the authority on this.
3. Client surfaces do not roll back with the web. A published CLI, extension or
   store build is in users' hands, and the only remedy is a new version.

## 5. Compatibility expectations

**Database.** A migration must be safe against the code that is currently
serving, because staging and production run different commits for the length of
a promotion, and a rollback puts the previous commit back in front of the new
schema. That makes additive migrations the default and a destructive one a
two-release sequence. `pnpm db:migrate -- verify` runs in the production deploy
before anything is promoted, and the deployment records the migration state it
serves.

**Clients.** A released client is older than the server for as long as its users
take to update, and a mobile or desktop user may never update. The server
therefore cannot assume a client version. `.github/workflows/cross-version-compatibility.yml`
is the part of this that is tested, and it is honest about its own limits: only
the CLI has a published predecessor to pair against, the cross-surface chain
needs a QA enterprise tenant that does not exist, and
`check-cross-version-matrix.mjs` fails if `.github/cross-version-matrix.json`
or `.github/cross-surface-e2e-chain.json` ever claims coverage it does not have.
The unreleased-pairs job fails on purpose, on a schedule, so the gap stays
visible.

## 6. Release channels and maturity

There is no stable/beta/canary channel split for the web application: one
deployment serves everyone. What varies per user is the feature, not the build.

`packages/contracts/types/src/model-catalog.ts` declares the maturity
vocabulary, `FEATURE_MATURITIES`, and `feature-registry.ts` gives every feature
a maturity plus, for anything not generally available, a `FeatureGovernance`
record naming its owner, exit criteria, kill switch, data migration, rollout
ring and support commitment. `FEATURE_MATURITY_LABELS` decides what a user is
shown: `Experimental`, `Beta`, `Deprecated`, and nothing at all for generally
available, because labelling everything is the same as labelling nothing.

Mobile carries its own release state in
`apps/mobile/src/features/release-state/mobileReleaseState.json`, because a
store build cannot be changed after submission.

## 7. Approvals and credentials

Production deployment runs under the `production-web` GitHub environment, which
is where an approval requirement is configured if one is required; the workflow
itself adds no manual gate beyond the staging status and the CI gate. Every
production job checks that its protected Vercel contract variables are present
and fails rather than deploying without them.

No release credential is in this repository. Each one is a GitHub secret read by
the workflow that needs it:

| Surface         | Secrets it needs                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Web and sandbox | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`                 |
| Migrations      | `AGI_DATABASE_URL`, `NEON_DATABASE_URL`                                                                 |
| CLI             | `NPM_TOKEN`, `SENTRY_DSN_CLI`                                                                           |
| Desktop         | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_CERTIFICATE`, `APPLE_API_KEY` |
| Mobile          | `EXPO_TOKEN`, `ASC_API_KEY_ID`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE`                                 |
| Incident paging | `PAGER_WEBHOOK_URL`                                                                                     |

`scripts/check-action-pins.sh`, run by `.github/workflows/actions-pinned-check.yml`,
hold third-party actions to a pinned SHA, so a release credential is never handed
to a tag someone else can move.

## 8. Emergency and hotfix paths

There is no path that skips CI. A hotfix is an ordinary commit to `main` that
goes through the same gate, which is a deliberate choice: the gate is minutes,
and a build that skipped it is a build nobody can roll back to with confidence.

What the emergency path actually is:

- **Serving the wrong thing.** Roll back, section 4. This is faster than any
  forward fix and needs no build.
- **A capability misbehaving.** The kill switch for that feature, from its
  `FeatureGovernance` record, through `/api/admin/feature-flags/kill-switches`.
  This changes behaviour without a deployment.
- **Actions itself down.** `docs/runbooks/release-rollback.md` section "From a
  laptop, when Actions is the thing that is down" is the manual path, and it is
  the only sanctioned way to act outside a workflow run.

## 9. Failed-release recovery

A production deploy that fails its own verification triggers the rollback step
in the same run, which is why the concurrency group does not cancel. A deploy
that succeeds but serves the wrong commit is caught by the daily
`production-drift` alarm at 07:00 UTC, which asks the public apex which commit
it is serving and fails when that is not `main`. That alarm exists because a
promotion that never ran reports `skipped`, and GitHub does not alert on
skipped.

After any rollback, the release audit trail carries the row: who, when, from
which deployment to which, and the reason, written by `recordEvent` in
`scripts/release/rollback.mjs`. A rollback with no reason is refused before
anything is called.

## 10. Migration review

Every migration is reviewed before merge through the ordinary pull request, and
the guards that run on it are the review's teeth rather than a checklist:
`check-neon-migrations.mjs` enforces the numbering and the presence of a down
file, and `check-migration-dependencies.mjs` flags a column added to a widely
referenced table. `pnpm db:migrate -- verify` then runs again in the production
deploy against the real ledger.

The roll-forward plan for a migration is its down file plus the rule in
section 4: the down file exists so a staging mistake can be undone, and
production rolls forward. A migration whose down file cannot restore the data it
dropped is a migration that must be split into two releases, with the
destructive half landing only after the code that stopped reading the column is
serving.
