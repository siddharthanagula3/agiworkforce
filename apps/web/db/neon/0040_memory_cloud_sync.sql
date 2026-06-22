-- =============================================================================
-- Migration: 0040_memory_cloud_sync.sql
-- Purpose  : Phase 0 foundation for cross-device MEMORY sync
--            (docs/plans/shared-cloud-state-2026-06-22.md).
--            Adds the server-authoritative monotonic `server_version` (the delta
--            sync cursor + conflict key) to `user_memories`, REUSING the shared
--            `public.cloud_sync_version_seq` + `public.assign_cloud_sync_version()`
--            trigger fn introduced for chat sync in 0038. `user_memories` already
--            carries `is_deleted` (tombstone) + `updated_at`, so this is the only
--            new column it needs to ride the same delta-sync transport as chats.
--
-- COORDINATION: ADDITIVE ONLY. MUST NOT touch 0037_rls_user_isolation.sql or any
--            RLS policy. `user_memories` already has a WITH CHECK policy
--            (0037:217-224); the sync API binds the session user server-side and
--            RLS is the backstop. `server_version` is not a user-scoping column.
--
-- Ordering : Runs after 0038 (which creates the sequence + trigger fn), so both
--            dependencies are guaranteed to exist.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / guarded backfill / DROP+CREATE).
--
-- Apply on a Neon branch first, then production via the Neon workflow.
-- =============================================================================

-- 1. New column (nullable first so we can backfill before NOT NULL).
ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS server_version BIGINT;

-- 2. Backfill existing rows with unique increasing versions from the SHARED
--    sequence. nextval() is per-row, so each existing row gets a distinct
--    monotonic value. Guarded by IS NULL so re-running does not re-version rows.
--    Runs BEFORE the trigger exists (step 4) so it is not clobbered.
UPDATE public.user_memories
  SET server_version = nextval('public.cloud_sync_version_seq')
  WHERE server_version IS NULL;

-- 3. Enforce NOT NULL now that every row has a version.
ALTER TABLE public.user_memories ALTER COLUMN server_version SET NOT NULL;

-- 4. Trigger: assign a fresh version on every INSERT and UPDATE so any change
--    (including a soft-delete via is_deleted, or a content/category edit)
--    advances the sync cursor. Reuses the 0038 trigger function.
DROP TRIGGER IF EXISTS trg_user_memories_sync_version ON public.user_memories;
CREATE TRIGGER trg_user_memories_sync_version
  BEFORE INSERT OR UPDATE ON public.user_memories
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

-- 5. Index for the delta-pull query (WHERE server_version > cursor ORDER BY
--    server_version). This is a FULL index (no is_deleted predicate) on purpose:
--    the sync pull MUST return tombstones (is_deleted = true) so deletes
--    propagate to other devices — unlike the partial idx_user_memories_user_id
--    (WHERE is_deleted = false) that backs the live list query. RLS still scopes
--    rows to the authenticated user.
CREATE INDEX IF NOT EXISTS idx_user_memories_server_version
  ON public.user_memories(server_version);
