# Database backup and restore

Status: Current
Owner: Platform lead
Last updated: 2026-09-05

Neon's point-in-time branch is the recovery mechanism today; there is no
separate `pg_dump` schedule, and until this document existed no restore had
ever been exercised end to end. `docs/security/key-rotation.md:169-179`
already describes what a restore needs from the encryption key ring; this
document describes the restore itself. Two drills prove it works:
`scripts/db-restore-drill.mjs` exercises Neon's own branch-from-timestamp API
and only ever runs against Neon, and `scripts/db-restore-drill-logical.mjs`
exercises the host-neutral path (`pg_dump` / `pg_restore`) that has to work
regardless of which Postgres host is behind `AGI_DATABASE_URL`. The Neon drill
proves Neon recovery; the logical drill proves the database is not welded to
Neon.

## What Neon actually retains

Neon's point-in-time window is a per-project setting,
`history_retention_seconds`, and this repository does not record what this
project's is set to. Check it before relying on any number below:

- Console: the project's **Settings → Instant restore** page shows the
  configured window in human units.
- API: `GET https://console.neon.tech/api/v2/projects/{project_id}` returns
  `history_retention_seconds` (an integer count of seconds) on the project
  object. Neon's own default is 24 hours (86400) unless the project has
  raised it, and raising it costs more on every plan above Free.

Everything past this window is gone. There is no secondary backup underneath
Neon's own retention: if the history window has elapsed, this runbook cannot
help.

## Two different operations, do not confuse them

Neon exposes both, and they behave differently:

| Operation                            | Endpoint                                                                                                | What happens to the branch                                                                                                                  | Connection string                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Create a branch from a point in time | `POST /projects/{project_id}/branches` with `branch.parent_timestamp`                                   | A brand new branch, disposable, existing branches untouched                                                                                 | New, separate URI                                                                                 |
| Restore a branch in place            | `POST /projects/{project_id}/branches/{branch_id}/restore` with `source_branch_id` + `source_timestamp` | The named branch's data is replaced by the historical state; pass `preserve_under_name` to keep the pre-restore state as a new branch first | Unchanged. Same host, same compute; connections reconnect automatically once the restore finishes |

The drill script only ever uses the first form. It creates a disposable
branch, never touches the branch it is restoring from, and deletes what it
created. A real incident restore is a decision to use the second form against
the production branch itself, made by a human, after the verification step
below has passed against a branch made the first way.

## Recovery procedure

1. **Pick the recovery point.** The last known-good timestamp, in RFC 3339
   form, no later than `now - history_retention_seconds`.
2. **Branch from it and verify, before touching production.**

   ```bash
   NEON_API_KEY=<api key, loaded from your shell's own env> \
   NEON_PROJECT_ID=<project id> \
     node scripts/db-restore-drill.mjs --at=2026-08-30T00:00:00Z --keep
   ```

   `--keep` leaves the branch up so the verification step below has something
   to point at; omit it for a routine drill that only needs the row counts.
   The script never prints the branch's connection string or the API key. It
   only prints the branch id and the row counts.

3. **Point a preview at the restored branch and verify.** In the Vercel
   project, set `AGI_DATABASE_URL` to the drill branch's connection URI
   **scoped to one Preview deployment**, never to Production and never as a
   project-wide default. Then run the same checks a real deployment gets:

   ```bash
   node scripts/verify-deployment.mjs https://<that-one-preview-url>
   ```

   `scripts/verify-deployment.mjs` already asserts the exact contract that
   matters here: `/api/health` returns this app's health envelope (not just
   any 200), and `/api/me` / `/api/usage` return the application's
   `UNAUTHORIZED` envelope rather than a raw framework error. That is proof
   the restored branch has the schema and the RLS policies the app expects,
   not just rows.

4. **Check the schema is current**, not just queryable:

   ```bash
   NEON_DATABASE_URL=<the drill branch's connection uri> \
     node scripts/neon-migrate.mjs status
   ```

   A recovery point older than the newest deployed migration will show a gap
   here. Decide whether to apply forward migrations to the restored branch or
   to pick a later recovery point before promoting anything.

## Promotion or rollback decision

Verification passing on a disposable branch is not itself a promotion. The
decision after that point is one of:

- **Promote**: perform the in-place restore (`POST
.../branches/{branch_id}/restore`) against the actual production branch,
  with `preserve_under_name` set so the pre-restore state is not discarded.
  Connection strings do not change, so no surface needs a redeploy. Traffic
  reconnects once the restore completes.
- **Roll back the decision, not the database**: if verification failed, or a
  later recovery point looks safer, delete the disposable branch (or, for a
  kept one, `node scripts/db-restore-drill.mjs`'s branch id via the Neon
  console) and try again from an earlier or later point. Nothing in
  production has been touched yet.

Never run the in-place restore as the first attempt at a recovery point. The
disposable-branch-then-verify path exists specifically so a bad recovery
point is caught before it overwrites the only copy of production.

## The encryption-key implication

A restored row is encrypted under whatever key was active in the environment
at the moment the recovery point was written, not the key active now. This is
exactly what `docs/security/key-rotation.md:184-191` ("Restoring a database
backup") already covers: put that old key into `<NAME>_RETIRED` under the id
the restored rows carry, then run `scripts/reencrypt.mjs`'s sweep to bring
them forward. Skipping that step leaves `connector_oauth_grants`,
`user_custom_connectors`, `github_installations`, and `user_two_factor` rows
permanently unreadable. Read `docs/security/key-rotation.md`'s "Accepted
risk: no KMS, no escrow" section before promoting a restore that crosses a
rotation boundary.

## The host-neutral drill: proving a Postgres host swap is real

The Neon drill above proves Neon's own point-in-time recovery works. It
proves nothing about what happens the day this application moves off Neon,
because it only ever speaks Neon's branch API. `scripts/db-restore-drill-logical.mjs`
is the drill for that day: it speaks plain Postgres wire protocol through
`pg_dump` and `pg_restore`, so it runs unchanged against Neon, a self-hosted
server, RDS, or the Homebrew Postgres this project uses for local
development.

It dumps the source database in custom format with `--no-owner
--no-privileges`, creates a scratch database on the target server, restores
into it, then checks the target against the source: every table in
`scripts/lib/restore-drill-core.mjs`'s `CORE_TABLES` is present, its row count
matches the source exactly, and the migration ledger
(`public.schema_migrations`, the table `scripts/lib/neon-migrations.mjs`'s
runner writes to) has the same row count on both sides. It prints a pass or
fail summary, host and database names only, and always drops the scratch
database on exit, including when a step fails partway through.

`CORE_TABLES` and the count and presence checks live in
`scripts/lib/restore-drill-core.mjs` so the Neon drill and this one check the
same tables the same way instead of drifting apart. Adding a table to the
core set updates both drills from one place.

### Configuration

Four environment variables, none of them read from a checked-in file:

| Variable                             | Meaning                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGI_RESTORE_DRILL_SOURCE_URL`       | Postgres connection string to dump from. Required.                                                                                                                             |
| `AGI_RESTORE_DRILL_TARGET_ADMIN_URL` | Connection string to an existing maintenance database (for example `postgres`) on the target server, used to create and drop the scratch database. Required.                   |
| `AGI_RESTORE_DRILL_SCRATCH_PREFIX`   | Prefix for the disposable scratch database name. Optional, defaults to `agi_restore_drill`.                                                                                    |
| `AGI_RESTORE_DRILL_PG_BIN_DIR`       | Directory holding `pg_dump` and `pg_restore`. Optional, defaults to whatever `PATH` resolves; on a Homebrew Postgres 17 install that is `/opt/homebrew/opt/postgresql@17/bin`. |

The script never prints a connection string, a username, or a password. It
prints only the source and target host and database names, and the scratch
database it created and dropped.

Source and target may point at the same server with a distinct scratch
database name, which is how the drill runs locally and in CI. Run it against
the Homebrew Postgres this project uses for local development:

```bash
AGI_RESTORE_DRILL_SOURCE_URL="postgresql://neondb_owner:localdev@127.0.0.1:5432/agiworkforce_dev" \
AGI_RESTORE_DRILL_TARGET_ADMIN_URL="postgresql://neondb_owner:localdev@127.0.0.1:5432/postgres" \
AGI_RESTORE_DRILL_PG_BIN_DIR="/opt/homebrew/opt/postgresql@17/bin" \
  node scripts/db-restore-drill-logical.mjs
```

### CI

`.github/workflows/db-restore-drill.yml` runs the logical drill weekly
(Monday 05:13 UTC) and on demand through `workflow_dispatch`, against a fresh
`postgres:17` service container: it applies every migration under
`apps/web/db/neon` through `pnpm db:migrate -- apply --target ci`, then runs
the drill with that same container as both source and target. It does not
touch the Neon drill's triggers or the Neon drill itself. No seed script for
the core tables exists yet, so the CI run proves the mechanism (dump, create,
restore, presence, count and ledger comparison, drop) against an
empty-but-migrated schema; row counts on both sides are 0 and still have to
match, which they do. Seeding the CI schema with representative rows is open
work, not a gap in the drill itself.

## One-day host-swap procedure

The P0 architecture mandate's target is a Postgres host swap provable by a
real rehearsal, not a diagram. The data half is this drill. The application
half is the second adapter, which landed on 2026-09-05: the same contract
suite in `packages/platform/data-layer/src/__tests__/adapter-contract.test.ts`
runs against both providers, and the app itself was driven against local
Postgres 17 over plain TCP with the tenant scope enforced.

1. **Pick the target host** and provision a database on it with the same
   encoding and extensions the current schema expects (`apps/web/db/neon`'s
   migrations are the source of truth for what those are).
2. **Choose the provider.** `AGI_DATABASE_PROVIDER` selects it and no code
   changes. `neon` speaks the Neon serverless WebSocket protocol and is the
   default; `postgres` speaks plain TCP through node-postgres and reaches any
   other host. The application's DB handles name no provider, so setting the
   variable is the whole change. A Postgres target that will serve an edge
   runtime still needs the Neon driver, which is the one capability the plain
   driver does not have.
3. **Rotate credentials** for the new host and store them the way
   `docs/security/key-rotation.md`'s custody inventory expects; never reuse a
   Neon-scoped credential against a different host.
4. **Run this drill against the new host** with `AGI_RESTORE_DRILL_SOURCE_URL`
   pointed at the current production database and `AGI_RESTORE_DRILL_TARGET_ADMIN_URL`
   at the new host's maintenance database. A pass proves the schema, the core
   tables, and the migration ledger transfer cleanly; run it more than once if
   the first attempt required schema changes.
5. **Rehearse the application against the new host** before any traffic moves.
   Point `AGI_DATABASE_CONTRACT_TEST_URL` at it and run the adapter contract
   suite, which proves query, transaction, rollback and tenant-scope behaviour
   on that host. The suite refuses a non-loopback host by design, so a remote
   rehearsal runs it through a local tunnel rather than by relaxing that check.
6. **Cut over** by setting `AGI_DATABASE_PROVIDER` and `AGI_DATABASE_URL` for
   the new host in one environment at a time, starting with a preview
   deployment, the same escalation `scripts/verify-deployment.mjs` already
   checks in the Neon recovery procedure above. Pool sizes in
   `apps/web/lib/server/db-pool-tuning.ts` assume a pooled endpoint; a host
   without one needs PgBouncer or RDS Proxy in front, because `pg` does not
   multiplex.

## Restore drill log

Run the Neon drill in `--keep` mode, do the verification step, then delete
the branch; run the logical drill directly, it always cleans up its own
scratch database. Record every real run here.

| Date       | Drill   | Recovery point / source → target                                            | Result                                                                       | Operator               |
| ---------- | ------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| _unfilled_ | Neon    |                                                                             |                                                                              |                        |
| 2026-09-05 | Logical | local Postgres 17, `agiworkforce_dev` → scratch database on the same server | PASS, 1457 ms, all `CORE_TABLES` and the migration ledger (168 rows) matched | Claude Code (Sonnet 5) |

`BLOCKED_BY_HUMAN`: the Neon drill has never been run. `NEON_API_KEY` and
`NEON_PROJECT_ID` are not currently provisioned in any environment this
repository controls, so `scripts/db-restore-drill.mjs` cannot run until an
operator creates a scoped Neon API key and records where it lives, the same
way `docs/security/tauri-updater-key-custody.md`'s custody inventory tracks
the updater signing key. The logical drill has no such blocker: it ran
against local Postgres 17 the same day this section was written, and runs
weekly in CI against a disposable `postgres:17` container.

## Open gaps

- This project's actual `history_retention_seconds` has never been read and
  recorded here. Do that the first time the drill runs.
- No RPO/RTO has been published to customers; that is a vendor-SLA
  commitment against Neon's plan, not something this document can assert.
- No third-party uptime monitor calls `/api/health`, so an outage that
  triggers a restore may be detected only by `docs/runbooks/incident-response.md`'s
  existing daily cron, not sooner.
- No production-shaped host other than Neon has been rehearsed. Both adapters
  are proven against local Postgres 17 and the contract suite runs on every
  host it is pointed at, but a managed host's TLS, pooling and connection
  ceiling are unmeasured until a real target exists.

Related: `docs/security/key-rotation.md` for what a restore does to encrypted
columns, `docs/runbooks/incident-response.md` for what paged this in the first
place, `apps/web/db/neon/verify/README.md` for standing up a throwaway
Postgres to test migration SQL directly (a different tool for a different
question, it never talks to Neon's API), `scripts/lib/restore-drill-core.mjs`
for the table list and checks both drills share, and
`scripts/db-restore-drill-logical.mjs` for the host-neutral drill itself.
