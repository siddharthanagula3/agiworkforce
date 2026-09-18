# Release Rollback Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-09-18

Until 2026-09-18 the only rollback in this repository was a step inside the job
that deployed. It fired on `failure()` of the same run, which covers exactly one
case: the deploy job noticed its own build was bad and was still alive to say
so. A build that verified and broke an hour later, a job the runner killed, a
cancelled run, and any regression found by a human all had no path at all.

This runbook describes the path that does not depend on the deploying run.

## What production is serving, and what it did last

`/admin/releases` (platform operators only) answers four questions from rows,
not from configuration:

- the commit, deployment id, environment and region this instance is running,
  read from `/api/version`'s own sources;
- whether the migration ledger's newest production record for `web` agrees with
  that commit, which is how a promotion that never recorded itself shows up;
- every promotion, rollback, failed verification and drill in
  `public.release_events`, newest first, with its actor and workflow run;
- whether the audit trail's hash chain is intact.

The same data is available at `GET /api/admin/releases`.

## Rolling production back

Rollback is a **workflow dispatch**, not a step in the deploy run.

1. Actions -> **Deploy Production Surfaces** -> **Run workflow**.
2. Set `rollback` to true and give `rollback_reason` a sentence. The reason is
   required; it is what the audit trail records and what the postmortem reads.
3. Leave `rollback_to` empty unless you know which deployment you want. Empty
   picks the newest READY production deployment created **before** the one
   serving now, which is not the same as "the newest READY deployment": after a
   previous rollback the build that was reverted away from stays READY and is
   newer than the one actually serving.
4. Approve the `production-web` environment when GitHub asks. The rollback takes
   the same approval as a deploy, deliberately: it changes what users get.

The job builds nothing. It calls
`POST /v1/projects/{projectId}/rollback/{deploymentId}`, then re-runs
`scripts/verify-deployment.mjs` against the public apex, then appends a
`rolled_back` row to the release audit trail.

### From a laptop, when Actions is the thing that is down

```sh
export VERCEL_TOKEN=... VERCEL_ORG_ID=... VERCEL_PROJECT_ID=...
export AGI_DATABASE_URL=...   # omit and the act is not audited, only warned about
node scripts/release/rollback.mjs --reason "why production is being reverted"
```

Add `--dry-run` to resolve the target and print it without acting. Add
`--to dpl_...` to name the deployment yourself.

### What the rollback does not do

- It does not revert the database. A deployment that ran a destructive migration
  is not recoverable by pointing traffic at an older build; see
  `docs/runbooks/database-backup-restore.md`.
- It does not stop the daily drift alarm from failing. `production-drift` asks
  whether production serves `main` HEAD, and after a rollback it correctly does
  not. That alarm stays red until a fix lands on `main` and deploys, which is
  the honest signal: production is knowingly behind.

## The drill

`Recovery Drills` (`.github/workflows/db-restore-drill.yml`) runs weekly. Its
`release-rollback-drill` job self-tests the resolver, then runs
`rollback.mjs --drill`, which resolves the deployment production would revert to
and records a `rollback_drill` row. It never acts: `--drill` forces dry run, so
the only Vercel calls are a project read and a deployment listing.

`/admin/releases` flags the drill as stale after 35 days. A drill that has never
succeeded reads "the rollback path is untested", which is the true statement
until one has.

## The audit trail

`public.release_events` (migration `0263`) is append-only and hash chained.

- The only supported write is `public.append_release_event(...)`, which computes
  the chain under an advisory lock so two concurrent writers cannot both claim
  the same predecessor.
- `UPDATE` is refused for every role, including the owner connection the deploy
  path holds. `DELETE` is refused for any row inside the 400 day retention
  window, so the trail ages out but cannot be edited or cleared after an
  incident.
- Editing a row in place breaks every link after it, which the dashboard reports
  as a broken chain naming the first bad id.

## Credential surface

The rollback path needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and
`AGI_DATABASE_URL`. That is the same set the deploy job already holds, and no
new secret was introduced. The `production-web` environment gates the acting
job; the weekly drill runs without that gate because `--drill` cannot act.

## Open gaps

- **The rollback target is Vercel's, not the repository's.** If the last healthy
  production deployment has been pruned by the platform, there is nothing to
  roll back to and the script refuses rather than picking something arbitrary.
  Fixing forward is then the only path.
- **The audit write is best effort when the database is the outage.** With
  `AGI_DATABASE_URL` unreachable the rollback still happens and the script warns
  that the trail was not written. The workflow run log is then the only record.
