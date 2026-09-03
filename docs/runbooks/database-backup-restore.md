# Database backup and restore

Status: Current
Owner: Platform lead
Last updated: 2026-09-03

Neon is the only backup this application has: there is no separate `pg_dump`
schedule, and until this document existed no restore had ever been exercised
end to end. `docs/security/key-rotation.md:169-179` already describes what a
restore needs from the encryption key ring; this document describes the
restore itself, and `scripts/db-restore-drill.mjs` is the drill that proves it
still works.

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

| Operation                            | Endpoint                                                                                                | What happens to the branch                                                                                                                  | Connection string                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Create a branch from a point in time | `POST /projects/{project_id}/branches` with `branch.parent_timestamp`                                   | A brand new branch, disposable, existing branches untouched                                                                                 | New, separate URI                                                                                  |
| Restore a branch in place            | `POST /projects/{project_id}/branches/{branch_id}/restore` with `source_branch_id` + `source_timestamp` | The named branch's data is replaced by the historical state; pass `preserve_under_name` to keep the pre-restore state as a new branch first | Unchanged — same host, same compute, connections reconnect automatically once the restore finishes |

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
   The script never prints the branch's connection string or the API key —
   only the branch id and the row counts.

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
   `UNAUTHORIZED` envelope rather than a raw framework error — proof the
   restored branch has the schema and the RLS policies the app expects, not
   just rows.

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
  Connection strings do not change, so no surface needs a redeploy — traffic
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
permanently unreadable — read `docs/security/key-rotation.md`'s "Accepted
risk: no KMS, no escrow" section before promoting a restore that crosses a
rotation boundary.

## Restore drill log

Run the drill in `--keep` mode, do the verification step, then delete the
branch and record the outcome here. An empty log means the procedure above
has never been exercised against a real Neon branch.

| Date       | Recovery point | Verification result | Operator |
| ---------- | -------------- | ------------------- | -------- |
| _unfilled_ |                |                     |          |

`BLOCKED_BY_HUMAN`: no drill has been run. `NEON_API_KEY` and
`NEON_PROJECT_ID` are not currently provisioned in any environment this
repository controls, so `scripts/db-restore-drill.mjs` cannot run until an
operator creates a scoped Neon API key and records where it lives, the same
way `docs/security/tauri-updater-key-custody.md`'s custody inventory tracks
the updater signing key.

## Open gaps

- This project's actual `history_retention_seconds` has never been read and
  recorded here — do that the first time the drill runs.
- No RPO/RTO has been published to customers; that is a vendor-SLA
  commitment against Neon's plan, not something this document can assert.
- No third-party uptime monitor calls `/api/health`, so an outage that
  triggers a restore may be detected only by `docs/runbooks/incident-response.md`'s
  existing daily cron, not sooner.

Related: `docs/security/key-rotation.md` for what a restore does to encrypted
columns, `docs/runbooks/incident-response.md` for what paged this in the first
place, `apps/web/db/neon/verify/README.md` for standing up a throwaway
Postgres to test migration SQL directly (a different tool for a different
question — that one never talks to Neon's API).
