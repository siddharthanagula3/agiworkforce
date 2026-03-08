# Migration Audit Report

Date: 2026-03-08
Auditor: zone-db agent

## Supabase Migrations

Four migrations exist in `supabase/migrations/`. Each is evaluated below.

---

### 1. `20260305000001_create_vibe_sessions.sql`

**Table**: `public.vibe_sessions`

**SQL Syntax**: Valid. Uses standard PostgreSQL syntax, `gen_random_uuid()`, `TIMESTAMPTZ`, JSONB, and TEXT arrays.

**RLS**: Enabled. Four policies cover SELECT, INSERT, UPDATE, DELETE — all scoped to `auth.uid() = user_id`. Both `USING` and `WITH CHECK` clauses are present on UPDATE.

**Foreign Keys**: `user_id REFERENCES auth.users(id) ON DELETE CASCADE` — correct.

**Indexes**:
- `idx_vibe_sessions_user_id` — user lookup (correct)
- `idx_vibe_sessions_status` — status filter (correct)
- `idx_vibe_sessions_last_activity` — DESC ordering (correct)
- `idx_vibe_sessions_user_status` — composite for user+status filter (correct)

**Triggers**: `update_vibe_session_updated_at` — BEFORE UPDATE per-row trigger keeps `updated_at` fresh. Correct.

**Security Issues**: None found. No injection vectors. RLS is complete.

**Finding**: PASS — no issues.

---

### 2. `20260305000002_create_vibe_messages.sql`

**Table**: `public.vibe_messages`

**SQL Syntax**: Valid. Uses correct JSONB defaults, NUMERIC for cost, and self-referential FK for `parent_message_id`.

**RLS**: Enabled. Four policies cover SELECT, INSERT, UPDATE, DELETE — all scoped to `auth.uid() = user_id`. Both `USING` and `WITH CHECK` are on UPDATE.

**Foreign Keys**:
- `session_id REFERENCES public.vibe_sessions(id) ON DELETE CASCADE` — correct, depends on migration 1
- `user_id REFERENCES auth.users(id) ON DELETE CASCADE` — correct
- `parent_message_id REFERENCES public.vibe_messages(id)` — self-referential, no CASCADE (intentional — orphaned thread roots are kept)

**Indexes**:
- `idx_vibe_messages_session_id` — session lookup (correct)
- `idx_vibe_messages_user_id` — user lookup (correct)
- `idx_vibe_messages_session_seq` — composite session+sequence for ordered fetch (correct)
- `idx_vibe_messages_created_at` — DESC time ordering (correct)
- `idx_vibe_messages_role` — role filter (correct)

**Trigger**: `trigger_vibe_message_inserted` AFTER INSERT updates the parent `vibe_sessions` row — increments `total_messages`, sums tokens, and refreshes `last_activity_at`. Correct.

**ISSUE — Trigger runs without security definer**: The `update_vibe_session_on_message` function lacks `SECURITY DEFINER`. This means the trigger runs as the calling user. Since RLS is enabled on `vibe_sessions`, the UPDATE inside the trigger will succeed only when the triggering user owns the session. This is correct behavior, but it creates a subtle edge case: if a service-role insert bypasses RLS and inserts a message for another user's session, the trigger UPDATE may fail silently due to RLS on `vibe_sessions`. This is low-risk in practice (service-role bypasses RLS anyway), but worth noting.

**Finding**: PASS with note. No immediate action required.

---

### 3. `20260307000001_create_shared_sessions.sql`

**Table**: `public.shared_sessions`

**SQL Syntax**: Valid. Uses `TEXT NOT NULL UNIQUE` for token, `JSONB` for messages, and `INTERVAL` for expiry default.

**RLS**: Enabled. Three policies cover SELECT (public, non-expired), INSERT (authenticated, owner check), DELETE (authenticated, owner check). No UPDATE policy — intentional for an immutable share record.

**ISSUE — Missing UPDATE RLS policy**: No UPDATE policy exists. In practice this is fine if the application never updates shared sessions (they are write-once, expire-delete). However, without an explicit UPDATE policy, any authenticated user calling UPDATE would be silently blocked by Supabase's RLS default (deny). This is safe but inconsistent — it would cause confusing errors if update is ever added. Recommend adding a restrictive policy or an explicit comment.

**Foreign Keys**: `owner_id REFERENCES auth.users(id) ON DELETE CASCADE` — correct.

**Indexes**:
- `idx_shared_sessions_token` — fast token lookup for public share links (correct)
- `idx_shared_sessions_owner_id` — owner management (correct)
- `idx_shared_sessions_expires_at` — cleanup and expiry filter (correct)

**pg_cron job**: The `cron.schedule()` call at the end will fail if `pg_cron` is not enabled in the Supabase project. This is not a syntax error but a runtime dependency. The comment correctly documents this requirement. However, if this migration runs on a project without `pg_cron`, it will error and the migration will fail entirely.

**ISSUE — pg_cron failure stops migration**: The `SELECT cron.schedule(...)` statement at the end of the migration is not wrapped in a `DO $$ BEGIN ... EXCEPTION WHEN undefined_function THEN NULL; END $$;` block. If `pg_cron` is unavailable, the entire migration fails. This is a deployment risk.

**Finding**: WARN — two issues found (missing UPDATE policy documentation, pg_cron fragility).

---

### 4. `20260307000002_create_github_installations.sql`

**Table**: `public.github_installations`

**SQL Syntax**: Valid. Uses `BIGINT` for `installation_id` (correct — GitHub installation IDs can exceed INT range), `TEXT` for encrypted token, `BOOLEAN` with default.

**RLS**: Enabled. Four policies cover SELECT, INSERT, UPDATE, DELETE — all authenticated, all owner-scoped via `user_id = auth.uid()`.

**Foreign Keys**: `user_id REFERENCES auth.users(id) ON DELETE CASCADE` — correct.

**Indexes**:
- `idx_github_installations_user_id` — user lookup (correct)
- `idx_github_installations_installation_id` — unique lookup by GitHub installation ID (correct; note: the UNIQUE constraint on the column means a btree index already exists implicitly — this explicit index is redundant but harmless)

**Security Issue — Encrypted token storage**: `access_token_enc TEXT` stores an encrypted GitHub access token. The column name's `_enc` suffix signals that encryption is applied at the application layer before insert. This is correct behavior but should be verified against the application code that writes to this column. No plaintext token should ever reach this column.

**ISSUE — Redundant index on UNIQUE column**: `CREATE INDEX idx_github_installations_installation_id ON public.github_installations(installation_id)` is redundant because `UNIQUE` constraints automatically create a btree index in PostgreSQL. This wastes storage and index maintenance overhead.

**Finding**: PASS with minor note (redundant index, acceptable).

---

## SQLite Migrations (Desktop)

Three migration files exist in `apps/desktop/src-tauri/migrations/`.

### `002_advanced_features.sql`

Creates: `tool_executions`, `file_metadata`, `file_tags`, `message_drafts`, `approval_settings`, `execution_plans`, `search_metadata`, `feature_preferences`, `suggestion_history`.

All reference `conversations(id)` and `messages(id)` via FK — these tables must exist from migration 001 (not present in this directory, likely embedded in Rust migration code at schema version < 002).

**ISSUE — Migration 001 is absent**: There is no `001_*.sql` file in this directory. The base tables `conversations` and `messages` are referenced but their creation SQL is missing from this directory. These are assumed to exist from the Rust-embedded schema (migrations.rs). This is not a bug but means the directory is incomplete as documentation.

Triggers use `IF NOT EXISTS` correctly for `CREATE TRIGGER`.

### `003_conversation_state.sql`

Creates: `conversation_states` table and two analytics views (`conversation_state_stats`, `conversation_state_by_model`).

Standalone — no FK dependencies. `expires_at` index supports cleanup. Views are read-only and safe.

### `20260224000100_add_chat_fts5.sql`

Backfill migration for FTS5 full-text search. Uses `NOT EXISTS` subquery for idempotent inserts. References `messages_fts` (FTS5 virtual table from migration v45) and `messages` (from base schema). The SQL is safe and correct.

**Note**: This file is a reference specification — the authoritative runner is `apply_migration_v55()` in `src/data/db/migrations.rs`. The SQL file alone is not auto-applied.

---

## Summary of Findings

| Migration | Status | Issues |
|-----------|--------|--------|
| 20260305000001_create_vibe_sessions | PASS | None |
| 20260305000002_create_vibe_messages | PASS | Trigger lacks SECURITY DEFINER (low risk) |
| 20260307000001_create_shared_sessions | WARN | pg_cron failure can block migration; no UPDATE RLS policy documented |
| 20260307000002_create_github_installations | PASS | Redundant index on UNIQUE column (minor) |
| SQLite 002_advanced_features | NOTE | Migration 001 absent from directory (not a bug) |
| SQLite 003_conversation_state | PASS | None |
| SQLite 20260224000100_add_chat_fts5 | PASS | Reference-only, Rust runner is authoritative |

Total issues: 1 WARN (shared_sessions pg_cron), 3 minor notes.
