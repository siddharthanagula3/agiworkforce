# Wave 5.1 — Author worker_registrations + work_units Supabase migrations

> Completed: 2026-05-09
> Branch: `task-w51-worker-migrations`
> Files added: 2 (1,184 / 102 LOC raw)
> Owner: migration-engineer

---

## 1. Summary

Authored two forward-only Supabase migrations under `supabase/migrations/` that
back the api-gateway worker control plane shipped in Task 1.7
(`task-1.7-services-inversion`). Without these tables the entire outbound-worker
direction-inversion protocol returns 500 in production: registration, archive,
poll, ack, complete, stop, and heartbeat all fail at the first DB query.

- `20260509000001_worker_registrations_and_work_units.sql` — creates both
  tables, indexes, triggers, and RLS policies.
- `20260509000002_lockdown_worker_tables.sql` — companion lockdown that asserts
  RLS is enabled, the JWT-claim `auth.role()` antipattern is absent, and at
  least one `TO service_role` policy exists on each table.

The `task-1.7-services-inversion` 1.7-report.md §8 enumerated the missing-DDL
problem and provided draft DDL — that DDL was the starting point but not the
final shape. The api-gateway code in
`services/api-gateway/src/worker/{registration,assignment,heartbeat}.ts` was
the **authoritative** schema source: the SQL had to match what those files
already read/write. Where the Task #1 prose differed from the api-gateway code
(e.g. `device_id` vs `id`, `assigned_to` vs `worker_id`), I deferred to the
code. See §3.1 below.

---

## 2. Files Created

| File                                                                         | LOC | Purpose                                                                                |
| ---------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------- |
| `supabase/migrations/20260509000001_worker_registrations_and_work_units.sql` | 234 | Both tables + indexes + RLS + triggers + comments                                      |
| `supabase/migrations/20260509000002_lockdown_worker_tables.sql`              | 90  | Lockdown assertions (HIGH-1 antipattern guard, RLS sanity, role-grant policy presence) |

No existing files modified.

---

## 3. Schema Decisions

### 3.1 Column-name divergence: code wins over prose

Task #1's description named columns `device_id` (PK) and `assigned_to`. The
api-gateway code uses `id` (PK) and `worker_id`. Both refer to the same
concept, but the column names must match the running code or every
api-gateway query fails with `42703 column does not exist` — the same class
of failure as RT-02 in `20260505000001_api_keys_key_prefix.sql`.

Verified call sites:

- `services/api-gateway/src/worker/registration.ts:104-118` — INSERT names
  every column we created. All present.
- `services/api-gateway/src/worker/registration.ts:280-298` — `/bridge`
  endpoint reads `worker_epoch`, `environment_secret_hash`, `status`. All
  present.
- `services/api-gateway/src/worker/assignment.ts:64-80` — Tier-2 secret
  verification reads `id, user_id, status, worker_epoch,
environment_secret_hash` from `worker_registrations` keyed on
  `environment_id`. All present.
- `services/api-gateway/src/worker/assignment.ts:175-201` — work_units poll
  selects `id, payload, idempotency_key`, filters by `environment_id =` and
  `status = 'pending'`. All present.
- `services/api-gateway/src/worker/heartbeat.ts:113-118` — heartbeat update
  sets `last_heartbeat_at`, `status = 'busy'`, `updated_at`. All present.
- `services/api-gateway/src/worker/heartbeat.ts:218-247` — reassign sweep
  reads `last_heartbeat_at`, `worker_id`, `environment_id`. All present.

### 3.2 environment_id type and check constraint

The api-gateway uses `environment_id` as a string, validated by
`validateBridgeId(/^[a-zA-Z0-9_-]+$/)` in
`services/api-gateway/src/worker/types.ts`. I encoded that same regex as a
table-level CHECK constraint so a bad row can never bypass the regex via a
direct DB INSERT (defence in depth — gateway validation is the first line,
but CI tools or migrations could otherwise INSERT raw).

`environment_id` is `text NOT NULL UNIQUE`, not uuid, even though the
gateway happens to populate it with `randomUUID()` at registration. This is
deliberate: the protocol allows arbitrary strings (CLI workers might use
hostnames, mobile workers might use device IDs), and the regex permits
anything in `[a-zA-Z0-9_-]+`.

### 3.3 worker_id and the FK choice

`work_units.worker_id` is `uuid NULL REFERENCES worker_registrations(id) ON
DELETE SET NULL`. SET NULL (not CASCADE) is intentional: when a worker is
deleted, the work units it had been assigned to should remain so they can be
reassigned, not vanish.

`work_units.environment_id` is `text NOT NULL REFERENCES
worker_registrations(environment_id) ON DELETE CASCADE`. CASCADE here is
correct: when the environment is gone, the work that targeted it has no
home and should be removed.

### 3.4 Status enums

- `worker_registrations.status` ∈ `(available, busy, offline)` — matches
  `services/api-gateway/src/worker/types.ts` and every status mutation in
  the gateway code.
- `work_units.status` ∈ `(pending, assigned, completed, failed,
reassigned)` — matches the prose in `1.7-report.md` §8 plus the
  `reassigned` value used by `heartbeat.ts:reassignStaleWork`. Not yet
  written by code, but reserved for the future reassignment flow.

### 3.5 idempotency_key shape

Task #1 specified `idempotency_key text UNIQUE NOT NULL` globally. The
api-gateway's `ackWorkSchema` requires it at ack time, but the gateway
INSERT path (the gateway-creates-work flow, not yet visible in
`task-1.7-services-inversion` because Task 1.7 only built the worker
endpoints) doesn't yet supply it. Two issues with the strict reading:

1. Global UNIQUE prevents the same key being used in different
   environments. The api-gateway's intent (2-worker collision detection on
   the same logical work unit) is per-environment, not global.
2. NOT NULL would force a default on rows the gateway hasn't yet learned to
   populate, leading to either bogus defaults or rejected INSERTs.

I therefore made `idempotency_key text NULL` with a `UNIQUE (environment_id,
idempotency_key) WHERE idempotency_key IS NOT NULL` partial unique index.
This satisfies the protocol intent (collision-detection per environment),
allows the gateway to backfill the key as code matures, and matches the
RT-02 partial-index pattern in
`20260505000001_api_keys_key_prefix.sql`.

### 3.6 RLS posture

Three policies on `worker_registrations`:

- `service_role full access` — TO service_role, USING true, WITH CHECK true.
  The gateway's `getServiceClient()` path uses this for all cross-row reads
  - status mutations.
- `authenticated user can insert own` — TO authenticated, WITH CHECK
  `auth.uid() = user_id`. Required because the registration insert at
  `registration.ts:103-117` uses `getUserScopedClient(userId)`, which sets
  the connection role to `authenticated` and binds the JWT user_id.
- `authenticated user can read own` — symmetric SELECT, in case the user
  ever needs to see their own registration list (no current callsite, but
  the policy is cheap and idiomatic).

One policy on `work_units`:

- `service_role full access` — workers never read this table directly; they
  receive work via long-poll resolved by the gateway.

All policies use `TO service_role` / `TO authenticated` (role-grant), NEVER
`auth.role() = 'service_role'`. The lockdown migration enforces this rule.

### 3.7 search_path pinning on triggers

Both new trigger functions pin `search_path = public, pg_temp` in the
function definition. This matches `20260506060001_fix_function_search_path_wave3.sql`
which retrofitted the same fix onto the previous wave's triggers. Pinning
at creation time skips the retrofit step.

### 3.8 Indexes

- `idx_worker_registrations_last_heartbeat_at` partial WHERE status IN
  ('available', 'busy') — supports the reassign-sweep query
  `.lt('last_heartbeat_at', cutoff).in('status', ['available', 'busy'])`.
- `idx_worker_registrations_user_id` — owner scoping.
- `idx_worker_registrations_status_env` — covers the "find another
  available worker in this env" query.
- `idx_work_units_env_status_created` — covers the poll query
  `.eq('environment_id', ...).eq('status', 'pending').order('created_at')`.
- `idx_work_units_worker_status` partial — covers the reassign
  `.eq('worker_id', ...).eq('status', 'assigned')` lookup.
- `idx_work_units_env_idempotency_key_unique` partial unique — collision
  detection for ack.

### 3.9 Forward-only / re-apply behaviour

Both migrations use `IF NOT EXISTS` on table + index + function definitions.
Re-apply in a partially-applied state is safe for those. `CREATE POLICY`
is the one statement that does NOT have `IF NOT EXISTS` in PostgreSQL, but
since Supabase tracks migrations by filename, re-apply is a no-op in
practice. If a future run does need to be idempotent, wrap each
CREATE POLICY in `DO $$ ... EXISTS pg_policies ... END $$;`.

The lockdown migration is pure-DO-block assertions. It will RAISE EXCEPTION
on a misconfigured state, otherwise NOTICE + continue. Re-applies are
no-ops after the first successful run because nothing mutates state.

---

## 4. Acceptance Criteria

| Criterion                                                                             | Status                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations apply cleanly to staging                                                   | **MANUAL** — runbook in §6 below; no local Postgres available in the agent environment                                                                        |
| services-engineer's worker registration end-to-end test passes against the new tables | **READY** — column shapes match all code references; ready for services-engineer to re-run their integration test                                             |
| Reassignment + idempotency verified                                                   | **DESIGNED** — schema supports both flows (FK SET NULL + partial UNIQUE on (environment_id, idempotency_key)); end-to-end test requires staging DB            |
| RLS denies non-service-role access                                                    | **DESIGNED** — `work_units` is service_role only; `worker_registrations` allows TO authenticated for own user_id only. Negative-path test requires staging DB |

---

## 5. Lint / Static-check Status

- `supabase db lint` requires a local Docker-managed Postgres; Docker is not
  running in this environment so lint cannot be exercised locally.
- Manual SQL review: re-read both files; cross-checked CREATE TABLE column
  list against every gateway INSERT/SELECT/UPDATE call; cross-checked policy
  USING/WITH CHECK clauses against the
  `20260505000003_replace_authrole_with_role_grant.sql` rules; checked all
  trigger function bodies for SET search_path.
- No code changes elsewhere in the repo, so `pnpm lint` / `pnpm typecheck`
  are untouched.

---

## 6. Staging Apply Runbook (for the user)

```bash
# 1. Verify migrations are present and the canonical dir is intact
ls supabase/migrations/20260509000001_worker_registrations_and_work_units.sql
ls supabase/migrations/20260509000002_lockdown_worker_tables.sql

# 2. Apply to staging via supabase CLI (linked to the staging project)
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --include-all

# 3. Verify the tables landed
supabase db remote get -p <STAGING_PROJECT_REF> < /dev/null # (not a real cmd; use mcp__supabase__list_tables instead)

# 4. Spot-check via psql (or the supabase MCP)
#    Expect: 2 tables, RLS enabled on both, 3 policies on worker_registrations,
#    1 policy on work_units.
SELECT schemaname, tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('worker_registrations', 'work_units');

SELECT tablename, policyname, roles, cmd
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('worker_registrations', 'work_units')
ORDER BY tablename, policyname;

# 5. Run services-engineer's integration test
pnpm --filter @agiworkforce/api-gateway test -- worker.test.ts
# Expect: 35/35 pass; the §14 E2E flow now exercises real Supabase rows
# instead of the mocked client.
```

If the lockdown migration RAISEs (e.g. RLS not enabled, or a JWT-claim
antipattern slipped in), DO NOT proceed — fix the offending policy and
re-run from step 2.

---

## 7. Downstream Unblockers

- **Task 1.7 (services-inversion)** — worker control-plane endpoints now have
  a real DB to talk to. services-engineer's `worker.test.ts` §14 E2E flow
  can be re-pointed from a mock to the real Supabase client.
- **Task 1.1 (Stripe staging push)** — partially unblocked. The Stripe RPC
  migration (`20260505000007`) does not depend on these tables, but the
  Wave 5.4 timestamp reconcile (Task #4 here) is still required before any
  prod push. See `w54-timestamp-reconcile-report.md` (this engineer, after
  Task #3).

---

## 8. Open Questions / Follow-ups

### 8.1 Add account_sessions table?

`registration.ts:222-238` SELECTs from `account_sessions` for the
Trusted-Device 10-min enrollment gate. I did not add that table here
because (a) it's outside Task #1's scope and (b) it may already exist via a
migration outside this repo's `supabase/migrations/` (e.g. via Supabase
Auth's built-in tables). If it does NOT exist, services-engineer's
`/api/auth/trusted_devices` endpoint will return `NO_ACTIVE_SESSION` for
every call, masking missing-table errors.

**Action:** services-engineer should grep the canonical + legacy migration
dirs for `account_sessions` and confirm it's a Supabase-managed Auth table
or backfill a migration in a Wave 5.x follow-up.

### 8.2 Hand-off to Wave 5.4 (Task #4 reconcile)

I'm starting Task #3 next, then Task #4. Task #4's timestamp reconcile
needs to be careful that 20260509000001/000002 do NOT collide with
anything in `apps/web/supabase/migrations/`. As of 2026-05-09 nothing
under May 9 exists in the legacy dir, so we're clean — but Task #4 will
re-verify.
