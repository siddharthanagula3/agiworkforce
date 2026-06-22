-- =============================================================================
-- Migration: 0041_projects_cloud_sync.sql
-- Purpose  : Phase 0 foundation for cross-device PROJECTS sync
--            (docs/plans/shared-cloud-state-2026-06-22.md).
--            Adds the server-authoritative monotonic `server_version` (delta
--            cursor + conflict key) AND a `deleted_at` soft-delete tombstone to
--            `user_projects`, REUSING the shared `public.cloud_sync_version_seq` +
--            `public.assign_cloud_sync_version()` trigger from 0038.
--
--            Projects currently HARD-delete (`delete from user_projects`); cross-
--            device sync needs a tombstone so a delete on one device propagates to
--            the others instead of resurrecting on the next pull. The DELETE route
--            is updated to soft-delete (set deleted_at) and the list query filters
--            `deleted_at is null`.
--
-- COORDINATION: ADDITIVE ONLY. MUST NOT touch 0037_rls_user_isolation.sql or any
--            RLS policy. `user_projects` already has a WITH CHECK policy (0037);
--            the sync API binds the session user server-side, RLS is the backstop.
--
-- Ordering : Runs after 0038 (sequence + trigger fn) and 0040 (memory), so all
--            dependencies exist.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / guarded backfill / DROP+CREATE).
--
-- Apply on a Neon branch first, then production via the Neon workflow.
-- =============================================================================

-- 1. New columns (nullable first so we can backfill server_version before NOT NULL).
ALTER TABLE public.user_projects
  ADD COLUMN IF NOT EXISTS server_version BIGINT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Backfill existing rows with unique increasing versions from the SHARED sequence.
--    Guarded by IS NULL so re-running does not re-version rows. Runs BEFORE the
--    trigger exists (step 4).
UPDATE public.user_projects
  SET server_version = nextval('public.cloud_sync_version_seq')
  WHERE server_version IS NULL;

-- 3. Enforce NOT NULL now that every row has a version.
ALTER TABLE public.user_projects ALTER COLUMN server_version SET NOT NULL;

-- 4. Trigger: assign a fresh version on every INSERT and UPDATE so any change
--    (incl. a soft-delete via deleted_at, or a name/instructions edit) advances the
--    sync cursor. Reuses the 0038 trigger function.
DROP TRIGGER IF EXISTS trg_user_projects_sync_version ON public.user_projects;
CREATE TRIGGER trg_user_projects_sync_version
  BEFORE INSERT OR UPDATE ON public.user_projects
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

-- 5. Index for the delta-pull query (WHERE server_version > cursor ORDER BY
--    server_version). The pull MUST return tombstones (deleted_at IS NOT NULL) so
--    deletes propagate. RLS still scopes rows to the authenticated user.
CREATE INDEX IF NOT EXISTS idx_user_projects_server_version
  ON public.user_projects(server_version);
