# Wave 5.4 — Reconcile Supabase 20260505000001/000002 timestamp collision

> Completed: 2026-05-09
> Branch: `task-w54-supabase-timestamp-reconcile`
> Files added: 2 (1 marker migration + this report)
> Files modified: 0 (no canonical SQL was edited)
> Owner: migration-engineer

---

## 1. Summary

Investigated the two filename collisions between `supabase/migrations/` (canonical)
and `apps/web/supabase/migrations/` (legacy) at versions `20260505000001` and
`20260505000002`. Cross-referenced both filesystems against the **actual prod
state** via Supabase MCP (`list_migrations` + targeted `execute_sql` lookups
on `pg_policies`, `pg_indexes`, `information_schema.columns`).

**Key finding:** the task description's threat model was outdated. The legacy
content was already applied to prod, BUT under DIFFERENT version numbers
(the `20260506*` set), not under `20260505000001`/`20260505000002` as the
prose implied. A blind `supabase db push` from the canonical dir would
attempt to re-apply all of `20260505000001..20260505000007` — most are
idempotent (no-ops), but one (`000005`) has a `CREATE POLICY` without
`IF NOT EXISTS` and would error.

**Reconcile strategy chosen:** add a marker migration documenting the
history; leave all 7 canonical files unmodified; provide a `migration repair`
runbook so the user can mark the 7 as applied (skipping their SQL on the
next `db push`) before pushing the genuine new migrations from Waves 5.1, 5.3,
and this Wave's marker.

---

## 2. Files

| File                                                                  | Purpose                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260509000005_canonical_dir_history_marker.sql` | Permanent NOTICE-only migration that lives on the migrations ledger and points future contributors to this report. |
| `tasks/research/exec/w54-timestamp-reconcile-report.md`               | This report — alignment table, reconcile rationale, runbook.                                                       |

No production-state changes. No edits to existing canonical SQL.

---

## 3. Investigation Method

### 3.1 Diffed both versions of the colliding files

```bash
diff supabase/migrations/20260505000001_api_keys_key_prefix.sql \
     apps/web/supabase/migrations/20260505000001_add_api_key_prefix.sql
```

Result: same column `key_prefix text NULL`, but **different index shape**:

- canonical: `api_keys_key_prefix_idx` non-unique partial.
- legacy: `idx_api_keys_key_prefix_unique` UNIQUE partial.

```bash
diff supabase/migrations/20260505000002_fix_github_installations_update_with_check.sql \
     apps/web/supabase/migrations/20260505000002_replace_authrole_with_role_grant.sql
```

Result: completely different SQL bodies (HIGH-2 fix vs HIGH-1 sweep). The
canonical's HIGH-1 sweep content lives at canonical `20260505000003_replace_authrole_with_role_grant.sql`.

### 3.2 Queried prod's migration ledger

`mcp__supabase__list_migrations` returned the full list (123 entries). Searched
for the version prefixes `20260505000001` and `20260505000002` — **NEITHER
EXISTS** in prod's `schema_migrations`. The closest matches by content are:

| Concept                           | Canonical filename                                              | Prod version     | Prod name                                    |
| --------------------------------- | --------------------------------------------------------------- | ---------------- | -------------------------------------------- |
| api_keys.key_prefix               | `20260505000001_api_keys_key_prefix.sql`                        | `20260506232038` | `create_api_keys_with_prefix`                |
| github_installations WITH CHECK   | `20260505000002_fix_github_installations_update_with_check.sql` | `20260506025923` | `fix_github_installations_update_with_check` |
| auth.role() rewrite               | `20260505000003_replace_authrole_with_role_grant.sql`           | `20260506025937` | `replace_authrole_with_role_grant`           |
| github_pr_review_attempts         | `20260505000004_create_github_pr_review_attempts.sql`           | `20260506025948` | `create_github_pr_review_attempts`           |
| connector_tool_permissions        | `20260505000005_connector_tool_permissions.sql`                 | `20260506025954` | `connector_tool_permissions`                 |
| Stripe integration columns + RPCs | `20260505000006_stripe_integration.sql`                         | `20260506030013` | `stripe_integration_canonical`               |
| Stripe webhook idempotency        | `20260505000007_stripe_webhook_idempotency.sql`                 | `20260506030028` | `stripe_webhook_idempotency_retry_safe`      |

So all 7 `20260505000001..20260505000007` canonical files are **content-applied
in prod under different version numbers**.

### 3.3 Verified actual prod schema matches expected content

Probed three of the seven content domains via `execute_sql`:

**`api_keys`** (`20260506232038 create_api_keys_with_prefix`):

```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='api_keys'
 ORDER BY ordinal_position;
```

Result includes `key_prefix text NULL`. ✓

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='api_keys';
```

Returns `idx_api_keys_key_prefix_unique ... UNIQUE INDEX ... WHERE (key_prefix IS NOT NULL)`.
This is the **legacy** content (UNIQUE partial), not the canonical's
non-unique form. Important implication for §4 below.

**`github_installations` UPDATE policy** (`20260506025923`):

```sql
SELECT policyname, cmd, qual, with_check, roles FROM pg_policies
 WHERE schemaname='public' AND tablename='github_installations';
```

Returns the UPDATE policy with both `qual = (user_id = auth.uid())` AND
`with_check = (user_id = auth.uid())`. WITH CHECK present. ✓

**HIGH-1 antipattern remaining**:

```sql
SELECT count(*) FROM pg_policies WHERE qual LIKE '%auth.role()%service_role%'
 OR with_check LIKE '%auth.role()%service_role%';
```

Returns `2`. The full HIGH-1 sweep was applied (per `replace_authrole_with_role_grant`)
but two compound policies were SKIPPED (the migration's design — see comments in
`20260505000003_replace_authrole_with_role_grant.sql` line 91-97). These remain
as documented technical debt; they are NOT a Wave 5.4 issue.

---

## 4. Reapply Risk Assessment

If a blind `supabase db push` were attempted today from the canonical dir
without `migration repair` first:

| Canonical version                                               | Re-apply risk        | Notes                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260505000001_api_keys_key_prefix.sql`                        | **LOW (waste only)** | `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS api_keys_key_prefix_idx`. Would create a SECOND index alongside the existing `idx_api_keys_key_prefix_unique`. Wasteful disk + extra writes; not broken.                                    |
| `20260505000002_fix_github_installations_update_with_check.sql` | **NONE**             | DO block + `ALTER POLICY` is idempotent. No-op since policy already has WITH CHECK.                                                                                                                                                                  |
| `20260505000003_replace_authrole_with_role_grant.sql`           | **NONE**             | DO block iterates pg_policies. Already done. 0 rewrites NOTICE, 2 skipped (compound). No-op.                                                                                                                                                         |
| `20260505000004_create_github_pr_review_attempts.sql`           | **NONE**             | All `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION`. Idempotent.                                                                                                                                          |
| `20260505000005_connector_tool_permissions.sql`                 | **HIGH**             | Has `CREATE POLICY "users manage own connector permissions" ...` and `CREATE TRIGGER connector_tool_permissions_updated_at ...` WITHOUT `IF NOT EXISTS`. **Would error** with `42710 duplicate_object` on re-apply since both already exist in prod. |
| `20260505000006_stripe_integration.sql`                         | **NONE**             | DO block + `ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION`. Idempotent.                                                                                                                                                                    |
| `20260505000007_stripe_webhook_idempotency.sql`                 | **NONE**             | All DO blocks with column-existence checks + `CREATE OR REPLACE FUNCTION`. Idempotent.                                                                                                                                                               |

**Conclusion**: 6 of 7 are safe to blind-re-apply (waste at worst). The 7th
(`000005`) is a hard error. The clean path is `migration repair` for all 7.

---

## 5. Reconcile Decision

Per the task scope: "do NOT modify production. Document the prod-push runbook
for the user."

**What I did:**

1. Added `supabase/migrations/20260509000005_canonical_dir_history_marker.sql`
   — a NOTICE-only migration documenting the legacy/canonical/prod alignment
   so the migrations ledger always carries this context. Comparing prod's
   ledger to the on-disk dir from then on shows exactly what's intentional.

2. **Did NOT modify any of the 7 canonical files.** Editing them would risk
   a future contributor re-applying the canonical against a fresh project
   and getting a different schema than prod — bug magnet.

3. **Did NOT delete the canonical files.** Deleting them would lose the
   on-disk record of the SQL that ran in prod (under different versions).
   Future incident responders trace by file content, not version number.

4. Authored the §6 runbook below for the user. The user MUST run the
   `migration repair` step before `db push` for the 7 redundant canonicals,
   or the `000005` re-apply will hard-error.

**What I did NOT do (out of scope):**

- Did not delete or refactor the 50 files in `apps/web/supabase/migrations/`
  (the legacy directory). That's a Wave 5.5+ cleanup task — the Architectural
  Rewrites #2 in `FINAL_AUDIT.md`. CLAUDE.md flags this as known debt.
- Did not run any DDL on prod.
- Did not make changes to the 7 canonical files. Even the `000005` policy/trigger
  IF NOT EXISTS fix would change the file's tracked content; the runbook's
  `migration repair` approach avoids the need for any source edit.

---

## 6. Prod-Push Runbook (for the user)

> The user MUST execute these steps in order. Each step is single-purpose
> and reversible up to the `db push` final step.

### Step 0 — Pre-flight check

```bash
# Verify the canonical directory matches what's expected.
ls supabase/migrations/2026050500000{1,2,3,4,5,6,7}*.sql
# Should list exactly 7 files.

# Verify Wave 5.1 + 5.3 + 5.4 marker migrations are in canonical:
ls supabase/migrations/202605090*
# Expected:
#   20260509000001_worker_registrations_and_work_units.sql      (Wave 5.1)
#   20260509000002_lockdown_worker_tables.sql                   (Wave 5.1)
#   20260509000003_rotate_dispatch_keys_rpc.sql                 (Wave 5.3)
#   20260509000004_lockdown_dispatch_keys.sql                   (Wave 5.3)
#   20260509000005_canonical_dir_history_marker.sql             (Wave 5.4)

# Verify the linked project is the production one (NOT staging by accident):
supabase link --project-ref <PROD_PROJECT_REF>
supabase status
```

### Step 1 — Mark the 7 redundant canonicals as applied (no SQL run)

```bash
supabase migration repair --status applied 20260505000001
supabase migration repair --status applied 20260505000002
supabase migration repair --status applied 20260505000003
supabase migration repair --status applied 20260505000004
supabase migration repair --status applied 20260505000005
supabase migration repair --status applied 20260505000006
supabase migration repair --status applied 20260505000007
```

Each command inserts a row into `supabase_migrations.schema_migrations`
WITHOUT executing the file's SQL. Idempotent — re-running is a no-op.

### Step 2 — Verify the repair worked

```bash
supabase migration list --linked
```

Expected: each of `20260505000001..20260505000007` now shows up as applied
on the remote, and the legend says they are "synced" with local.

### Step 3 — Apply the genuinely new migrations

```bash
supabase db push
```

The new migrations from Waves 5.1, 5.3, 5.4 will apply in version order:

- `20260509000001_worker_registrations_and_work_units.sql`
- `20260509000002_lockdown_worker_tables.sql`
- `20260509000003_rotate_dispatch_keys_rpc.sql`
- `20260509000004_lockdown_dispatch_keys.sql`
- `20260509000005_canonical_dir_history_marker.sql`

Plus any other unapplied canonical migrations (e.g. `20260508*` if not yet
in prod — verify via `migration list` first).

### Step 4 — Post-push verification

```sql
-- Worker tables landed:
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('worker_registrations','work_units','dispatch_keys')
 ORDER BY table_name;
-- Expected 3 rows.

-- RLS posture intact:
SELECT tablename, policyname, roles FROM pg_policies
 WHERE tablename IN ('worker_registrations','work_units','dispatch_keys')
 ORDER BY tablename, policyname;

-- New RPC exists with expected signature:
SELECT pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname='rotate_dispatch_keys';

-- HIGH-1 antipattern still at 2 (NOT 0 — the 2 compound policies are known TD,
-- see 20260505000003_replace_authrole_with_role_grant.sql line 91-97):
SELECT count(*) FROM pg_policies
 WHERE qual LIKE '%auth.role()%service_role%' OR with_check LIKE '%auth.role()%service_role%';
```

### Step 5 — Stripe push unblock

After steps 0-4 succeed, **Wave 5.5 (Stripe staging push, Task 1.1)** is
unblocked. The Stripe RPC migration `20260505000007_stripe_webhook_idempotency.sql`
is content-applied (under prod's `20260506030028`); Step 1's repair marks
the canonical version as applied; Step 3 applies any newer Stripe-related
migrations cleanly.

---

## 7. What Could Still Go Wrong

### 7.1 If the user skips Step 1 and runs `db push` directly

The `20260505000005_connector_tool_permissions.sql` will hit `42710
duplicate_object` on the `CREATE POLICY` and abort the transaction.
Recovery: run Step 1's `migration repair --status applied 20260505000005`
(skip the rest), then re-run `db push`. The other 6 redundant canonicals
will still apply but as idempotent no-ops — wasteful but not broken.

### 7.2 If the user runs `db push` from `apps/web/supabase/migrations/`

That dir still has the legacy 000001/000002 files but those have NOT been
recorded against the same project's schema_migrations. A push from the
LEGACY dir would attempt to re-apply versions like `20260101000003_add_stripe_integration.sql`
which (under prod's tracking) was applied as `20260104030659 add_stripe_integration`.
Hard breakage likely. **Do not push from the legacy dir.** It is canonically
deprecated as of this report.

### 7.3 If staging diverges from prod

The runbook above targets the prod project. If the user has a staging
project that's tracking a different schema_migrations state, they must
run Steps 0-4 on staging first, verify, then repeat on prod. This is the
standard Supabase environment-promotion pattern.

---

## 8. Downstream Unblockers

- **Task 1.1 (Stripe staging/prod push)** — fully unblocked after Steps 1-3
  succeed. The Stripe migrations are content-applied; the runbook reconciles
  the version-tracking divergence.
- **Wave 5.5 merge train** — the runbook lets the merge-train coordinator
  apply the 7 feature branches' migrations (Wave 5.1, 5.3, 5.4 are mine;
  others may add more) cleanly to staging then prod.
- **Architectural Rewrites #2 (legacy dir cleanup)** — out of scope here,
  but this report's alignment table is the authoritative input for that
  cleanup task. The 50 legacy files can be deleted once a future Wave verifies
  every legacy file's content has a prod ledger entry.

---

## 9. Open Questions / Follow-ups

### 9.1 Two HIGH-1 antipattern policies remaining

`SELECT count(*) FROM pg_policies WHERE auth.role()='service_role' is in qual or with_check`
returns **2** in prod. These are the "compound policies" that
`20260505000003_replace_authrole_with_role_grant.sql:91-97` deliberately
skipped. They need a hand-fix migration. **Out of scope for Task 4; track in a
follow-up Wave.**

### 9.2 Legacy-dir-only files not present in canonical

The legacy dir has 50 files; the canonical has 36. Some legacy-only files
(e.g. `20260101000000_consolidated_schema.sql`, `20260101000001_add_missing_functions.sql`,
`20260101000002_fix_functions.sql`) ARE the bulk of prod's early-history
content. The on-disk copy of those is the only on-disk record. Deleting the
legacy dir without first either (a) merging those files into canonical with
new timestamps, or (b) accepting that prod's schema_migrations is the only
remaining record, would lose history. **Out of scope; flag for the
Architectural Rewrites #2 cleanup.**

### 9.3 The `20260506232038 create_api_keys_with_prefix` migration is on prod

but in NEITHER directory

This migration exists on prod's ledger but cannot be found in canonical or
legacy. It was likely applied via a hand-crafted `apply_migration` MCP call
during the May 6 sprint. The on-disk equivalent (legacy
`20260505000001_add_api_key_prefix.sql`) has matching content, so this is
a non-issue for state reconstruction — but it's a process gap. Future
ad-hoc `apply_migration` calls should always also save the SQL into the
canonical migrations dir.
