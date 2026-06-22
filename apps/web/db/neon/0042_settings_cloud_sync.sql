-- =============================================================================
-- Migration: 0042_settings_cloud_sync.sql
-- Purpose  : Phase 0 foundation for cross-device SETTINGS sync
--            (docs/plans/shared-cloud-state-2026-06-22.md).
--            Adds the server-authoritative monotonic `server_version` (delta
--            cursor + conflict key) to `user_settings`, REUSING the shared
--            `public.cloud_sync_version_seq` + `public.assign_cloud_sync_version()`
--            trigger from 0038.
--
--            Settings is ONE JSONB row per user (namespace-keyed), so there is no
--            tombstone — the row is upsert-only, never deleted. Only the cursor
--            column + trigger + index are needed. The /api/settings/sync endpoint
--            syncs ONLY a fail-closed cloud-safe NAMESPACE ALLOWLIST (theme,
--            personalization, etc.) and NEVER secret namespaces (BYOK/provider
--            keys, local model paths, device config) — see the route + its tests.
--
-- COORDINATION: ADDITIVE ONLY. MUST NOT touch 0037_rls_user_isolation.sql or any
--            RLS policy. user_settings is keyed by user_id (PK); RLS isolates it.
--
-- Ordering : Runs after 0038 (sequence + trigger fn). Idempotent.
--
-- Apply on a Neon branch first, then production via the Neon workflow.
-- =============================================================================

-- 1. New column (nullable first so we can backfill before NOT NULL).
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS server_version BIGINT;

-- 2. Backfill existing rows from the SHARED sequence (guarded by IS NULL).
UPDATE public.user_settings
  SET server_version = nextval('public.cloud_sync_version_seq')
  WHERE server_version IS NULL;

-- 3. Enforce NOT NULL.
ALTER TABLE public.user_settings ALTER COLUMN server_version SET NOT NULL;

-- 4. Trigger: bump server_version on every INSERT/UPDATE so any settings change
--    (incl. the existing /api/settings/preferences PUT path) advances the sync
--    cursor and propagates to other devices. Reuses the 0038 trigger function.
DROP TRIGGER IF EXISTS trg_user_settings_sync_version ON public.user_settings;
CREATE TRIGGER trg_user_settings_sync_version
  BEFORE INSERT OR UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

-- 5. Index for the delta-pull query (WHERE server_version > cursor). RLS scopes
--    rows to the authenticated user; this is one row per user so the index is tiny.
CREATE INDEX IF NOT EXISTS idx_user_settings_server_version
  ON public.user_settings(server_version);
