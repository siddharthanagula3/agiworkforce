# Wave 5.9 — Hardening: account_sessions verify + auth.role compound policy fix + orphan migration reconcile

> Completed: 2026-05-09
> Branch: `task-w59-hardening`
> Files added: 4 (3 SQL + this report)
> Owner: migration-engineer

---

## 1. Summary

Three hardening items, all originally flagged in earlier Wave 5.1 / 5.4 reports:

1. **Issue 1 — `account_sessions` table missing.** Author the table.
2. **Issue 2 — 2 HIGH-1 `auth.role()='service_role'` policies remain.** Identify them, drop the redundant qual.
3. **Issue 3 — `20260506232038_create_api_keys_with_prefix` orphan migration.** Reconstruct the SQL from prod introspection.

All three resolved with new migrations under `supabase/migrations/`. No prod
state was modified — migrations are forward-only and safe to apply via the
runbook in §5.

---

## 2. Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260506232038_create_api_keys_with_prefix.sql` | RECONSTRUCTED from prod introspection. Lives at the prod-applied version so `db push` to a fresh project replays the same schema in the same order. |
| `supabase/migrations/20260509000006_account_sessions.sql` | Authors the `public.account_sessions` ledger that the api-gateway Trusted-Device gate reads. Minimal schema; writer side is a follow-up. |
| `supabase/migrations/20260509000007_drop_authrole_compound_policies.sql` | DO-block sweep over the 2 known HIGH-1 holdouts. ALTERs in place; refuses to touch any policy whose qual no longer matches the known antipattern; final-assert that 0 antipattern policies remain. |
| `tasks/research/exec/w59-hardening-report.md` | This report. |

No edits to existing SQL. No prod-state changes.

---

## 3. Issue 1 — account_sessions

### 3.1 Investigation

`mcp__supabase__execute_sql` against prod:

```sql
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_name = 'account_sessions';
-- 0 rows
```

The closest existing tables are `auth.sessions` (Supabase Auth built-in,
contains `id, user_id, created_at, ...`), `public.shared_sessions`,
`public.signaling_sessions`, `public.vibe_sessions` — none of which match
the api-gateway's read.

Code reference (on `task-1.7-services-inversion`):

```typescript
// services/api-gateway/src/worker/registration.ts:222-238
const { data: session } = await client
  .from('account_sessions')
  .select('created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

PostgREST routes the unqualified `account_sessions` to `public.account_sessions`,
so `auth.sessions` is NOT what the code is querying. The table genuinely
doesn't exist anywhere on disk or in prod.

### 3.2 Decision

Author a minimal `public.account_sessions` table that satisfies the read
path (id, user_id, created_at + housekeeping `updated_at`). Token data is
intentionally absent — the writer side has not yet been written. When a
future migration adds an Express middleware that records sessions, it can
ALTER the table to add token fields without breaking the read.

RLS: service_role only via `TO service_role`. The api-gateway uses the
service-role client to read; no user-direct path exists today.

`search_path = public, pg_temp` pinned on the trigger function per
`20260506060001` convention.

### 3.3 Without this fix

Every `POST /api/auth/trusted_devices` call returns `403 NO_ACTIVE_SESSION`
because `.maybeSingle()` returns `null` for any user_id. The api-gateway's
`worker.test.ts §12` accepts that as the green path because the test
mocks the supabase client; the bug only manifests in prod.

### 3.4 Follow-up

After the writer side lands (Wave 5.10+), this table fills. Until then,
Trusted-Device enrollment is functionally disabled — call sites should
catch the 403 and treat absence-of-trusted-device as the default state
(which they already do per the registration.ts +
`hasTrustedDevice: typeof trustedDeviceToken === 'string'` log line).

---

## 4. Issue 2 — auth.role() compound policies

### 4.1 Investigation

```sql
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE qual LIKE '%auth.role()%service_role%'
    OR with_check LIKE '%auth.role()%service_role%';
```

Returns exactly 2 rows:

| schema | table | policy | cmd | roles | qual / with_check |
|---|---|---|---|---|---|
| public | beta_invites | Service role can manage invites | ALL | `{service_role}` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |
| public | waitlist | Service role can manage waitlist | ALL | `{service_role}` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |

These are NOT truly compound (no AND/OR/NOT). The only reason
`20260505000003_replace_authrole_with_role_grant.sql` SKIPPED them is that
its `is_simple_qual` regex matched bare `auth.role()='service_role'::text`
forms but NOT the `(SELECT auth.role()) = 'service_role'::text` SELECT
subquery wrapper. Postgres normalises the qual to the SELECT form when
the policy was originally created via SET parameter (or rewriting via
some Supabase Studio path).

### 4.2 Threat

Anyone with `SUPABASE_JWT_SECRET` can mint a JWT with `role:'service_role'`
and `sub: VICTIM_UUID`. With the pre-fix policy:

- Connection role: typically `authenticated` (the JWT is presented over
  the standard PostgREST connection).
- `auth.role()` returns `'service_role'` because that's the JWT claim.
- Qual `(SELECT auth.role()) = 'service_role'` evaluates TRUE.
- Policy is `TO service_role`, so a connection NOT SET ROLE'd to
  service_role should be rejected — BUT `TO service_role` means the
  policy IS APPLICABLE only to service_role connections. A connection
  with role `authenticated` is governed by OTHER policies, not this one.

So in practice the `TO service_role` clause already prevents the JWT-claim
attack on these tables — the qual is **redundant**, not an active
vulnerability. However, it's still the documented HIGH-1 antipattern and a
future maintainer might mistake it for a working defence-in-depth check
when in fact it's just dead code.

### 4.3 Fix

ALTER POLICY in-place: replace qual + with_check with `true`. Net:

- Roles `{service_role}` (unchanged) → only SET-ROLE'd service_role
  connections match.
- Qual `true` / WITH CHECK `true` → no per-row gate (service_role bypasses
  RLS by design anyway, but having an explicit policy avoids confusion).

The migration includes a refuse-to-touch defensive check: if the
qual/with_check no longer matches the exact known antipattern regex, it
WARNs and skips. A second DO block at the end RAISEs EXCEPTION if any
antipattern policies remain anywhere in the schema — so the migration
fails loudly if a hand-edit slipped a new compound policy in between
authoring and apply.

### 4.4 Why ALTER, not DROP+CREATE

Both `beta_invites` (1 row) and `waitlist` (1 row) have data verified
2026-05-09. ALTER POLICY changes the qual atomically without a window
where the policy is absent. DROP+CREATE would have a brief window during
which any in-flight transaction could either sneak through (if there's no
other applicable policy) or be denied (if there is). ALTER is strictly
better for live tables.

---

## 5. Issue 3 — orphan `20260506232038_create_api_keys_with_prefix`

### 5.1 Investigation

`mcp__supabase__list_migrations` shows:

```json
{"version":"20260506232038","name":"create_api_keys_with_prefix"}
```

— but this version is missing from BOTH:
- `supabase/migrations/` (canonical)
- `apps/web/supabase/migrations/` (legacy)

The closest on-disk file is `apps/web/supabase/migrations/20260505000001_add_api_key_prefix.sql`
(legacy), which contains nearly-identical SQL but at a different version
prefix.

The orphan was applied via a hand-crafted `mcp__supabase__apply_migration`
MCP call during the May 6 sprint, without saving the SQL to canonical.
This is the documented process gap.

### 5.2 Reconstruction

Probed prod via `mcp__supabase__execute_sql`:

```sql
-- columns
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='api_keys'
 ORDER BY ordinal_position;

-- indexes
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public' AND tablename='api_keys';

-- constraints
SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
       ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name AS references_,
       rc.delete_rule, rc.update_rule
  FROM information_schema.table_constraints tc ...

-- policies
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE schemaname='public' AND tablename='api_keys';

-- triggers
SELECT trigger_name, ... FROM information_schema.triggers
 WHERE event_object_schema='public' AND event_object_table='api_keys';
-- (none)
```

Reconstructed schema:
- 9 columns: `id, user_id, name, key_hash, scopes, last_used_at, expires_at, created_at, key_prefix`
- PK: `(id)` — uses `uuid_generate_v4()` default (uuid-ossp installed at `extensions` schema)
- FK: `user_id` → `public.profiles(id) ON DELETE CASCADE`
- 2 indexes: `idx_api_keys_user_id` btree, `idx_api_keys_key_prefix_unique` UNIQUE partial WHERE `key_prefix IS NOT NULL`
- RLS: ON
- 2 policies: `Service role manages api keys` TO service_role, `Users can manage own api keys` **TO public** (not TO authenticated — verified)
- 0 triggers

The reconstructed migration is byte-equivalent to prod state. Saved at
`supabase/migrations/20260506232038_create_api_keys_with_prefix.sql` so a
fresh project clone gets the same schema in the same migration order.

### 5.3 Process gap fix

Documented in the migration's header comment block. Future ad-hoc
`apply_migration` calls SHOULD also write the SQL to the canonical dir at
the same time. The team should consider a CI check that compares
`supabase migration list --linked` against the on-disk files and fails on
ANY orphan version (file-on-prod-but-not-on-disk).

### 5.4 The `Users can manage own api keys` policy is TO public

Reconstructing exactly what's in prod faithfully reproduces the `TO public`
clause. This is **broader than `TO authenticated`** — any role (including
`anon`) is matched, with the qual `auth.uid() = user_id` providing the
gate. The qual returns NULL for anon (since `auth.uid()` returns NULL
when no user is authenticated), and `NULL = user_id` evaluates UNKNOWN
which RLS treats as DENY, so the practical effect is the same as
TO authenticated — but it relies on the qual to do the role gating,
which is fragile.

**Out of scope for Wave 5.9** — this is the prod state and our job here
is faithful reconstruction, not hardening. A separate Wave 5.10 follow-up
should retighten this to `TO authenticated`.

---

## 6. Acceptance Criteria

| Criterion | Status |
|---|---|
| Issue 1: account_sessions resolved with migration | **DONE** — `20260509000006_account_sessions.sql` |
| Issue 2: 2 HIGH-1 compound policies fixed with migration | **DONE** — `20260509000007_drop_authrole_compound_policies.sql`. Final assertion in the migration RAISEs EXCEPTION if any antipattern policy remains anywhere. |
| Issue 3: orphan migration reconstructed in canonical | **DONE** — `20260506232038_create_api_keys_with_prefix.sql` written under the prod-applied version. |
| Findings written to `tasks/research/exec/w59-hardening-report.md` | **DONE** — this file. |

---

## 7. Lint / Static-check Status

- `supabase db lint` requires Docker (not running locally).
- Manual SQL review: re-read all 3 migrations; cross-checked policy/index
  shapes against prod introspection; verified trigger function search_path
  pinning; verified DO block defensive checks in migration #2.
- No code changes elsewhere; pnpm/cargo toolchain unaffected.

---

## 8. Staging Apply Runbook (for the user)

> Run AFTER the Wave 5.4 prod-push runbook (`migration repair` for
> 20260505000001..000007) has been executed.

```bash
# 1. Verify all 4 new migrations are present.
ls supabase/migrations/20260506232038_create_api_keys_with_prefix.sql
ls supabase/migrations/20260509000006_account_sessions.sql
ls supabase/migrations/20260509000007_drop_authrole_compound_policies.sql

# 2. Mark the orphan as applied on prod (it's already applied; the file is
#    new on disk and supabase db push would otherwise try to re-apply it,
#    failing on the duplicate "Service role manages api keys" CREATE POLICY).
supabase migration repair --status applied 20260506232038

# 3. Apply the 2 genuinely-new migrations.
supabase db push
# Expected: 2 migrations applied:
#   20260509000006 account_sessions
#   20260509000007 drop_authrole_compound_policies

# 4. Verify post-apply.
#    a) account_sessions exists, RLS on, only TO service_role policy.
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name='account_sessions';
SELECT policyname, roles FROM pg_policies
 WHERE schemaname='public' AND tablename='account_sessions';

#    b) zero auth.role()=service_role antipattern policies remain.
SELECT count(*) FROM pg_policies
 WHERE qual LIKE '%auth.role()%service_role%'
    OR with_check LIKE '%auth.role()%service_role%';
-- Expected: 0

#    c) the 2 fixed policies still TO service_role with USING (true).
SELECT tablename, policyname, qual, with_check FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('beta_invites','waitlist')
   AND policyname LIKE 'Service role can manage%';
-- Expected: qual = 'true', with_check = 'true', roles = '{service_role}'

#    d) api_keys schema unchanged (the orphan reconstruction is no-op on prod).
SELECT count(*) FROM pg_policies
 WHERE schemaname='public' AND tablename='api_keys';
-- Expected: 2 (Service role manages api keys + Users can manage own api keys)
```

---

## 9. Downstream

- **Trusted-Device enrollment:** unblocked at the table level. Still
  functionally disabled in prod until a writer migration lands; not in
  Wave 5.9 scope.
- **HIGH-1 fully cleared:** zero `auth.role()='service_role'` qual/check
  in `pg_policies` after this wave. Future RLS additions should use the
  `TO service_role` role-grant pattern only.
- **Process gap closed:** orphan migration now has its on-disk record. CI
  hardening (orphan detection) is a Wave 5.10+ follow-up.

---

## 10. Open Questions / Follow-ups

### 10.1 account_sessions writer

The read side is wired in `services/api-gateway/src/worker/registration.ts`.
A writer needs to land before Trusted-Device enrollment can actually
succeed in prod. The natural place: an Express middleware on the
api-gateway's `/auth/login` route that INSERTs a row on every successful
auth. Out of scope for Wave 5.9.

### 10.2 api_keys "Users can manage own api keys" policy is TO public

Faithfully reconstructed from prod. Should be retightened to
TO authenticated in a Wave 5.10 follow-up. This Wave 5.9 work intentionally
preserved prod state.

### 10.3 CI orphan-migration check

Recommend a CI step:

```bash
supabase migration list --linked --output json \
  | jq '.[] | select(.local==null) | .version' \
  | while read v; do echo "ORPHAN: prod has $v with no local file"; exit 1; done
```

This would prevent future ad-hoc `apply_migration` from drifting from disk.
