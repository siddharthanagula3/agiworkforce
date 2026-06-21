-- =============================================================================
-- Migration: 0038_cloud_sync_versioning.sql
-- Purpose  : Phase 0 foundation for cross-device cloud chat sync
--            (docs/plans/cross-device-cloud-sync-design-2026-06-20.md).
--            Adds a server-authoritative monotonic `server_version` (the delta
--            sync cursor + conflict key) and message tombstone/updated columns
--            to the shared cloud chat store. Web's `web_conversations.id` /
--            `web_messages.id` (uuid) ARE the canonical cloud IDs; mobile already
--            matches; desktop maps its INTEGER PK to a UUIDv7 `cloud_id` on its
--            own side (no change here).
--
-- COORDINATION: This migration is ADDITIVE ONLY. It MUST NOT touch
--            0037_rls_user_isolation.sql or any RLS policy (owned by a separate
--            workstream landing RLS WITH CHECK). RLS continues to enforce user
--            isolation on these tables; the new columns are not user-scoping
--            columns and do not affect any policy.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / guarded backfill / OR REPLACE).
--
-- Apply on a Neon branch first, then production via the Neon workflow.
-- =============================================================================

-- 1. Shared monotonic version sequence (one cursor spans conversations+messages).
CREATE SEQUENCE IF NOT EXISTS public.cloud_sync_version_seq AS BIGINT;

-- 2. New columns (nullable first so we can backfill before NOT NULL).
ALTER TABLE public.web_conversations
  ADD COLUMN IF NOT EXISTS server_version BIGINT;

ALTER TABLE public.web_messages
  ADD COLUMN IF NOT EXISTS server_version BIGINT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Backfill existing rows with unique increasing versions. nextval() is
--    evaluated per row, so every existing row gets a distinct monotonic value.
--    Guarded by `IS NULL` so re-running the migration does not re-version rows.
--    NOTE: runs BEFORE the trigger exists (step 5) so it is not clobbered.
UPDATE public.web_conversations
  SET server_version = nextval('public.cloud_sync_version_seq')
  WHERE server_version IS NULL;

UPDATE public.web_messages
  SET server_version = nextval('public.cloud_sync_version_seq')
  WHERE server_version IS NULL;

-- 4. Enforce NOT NULL now that every row has a version.
ALTER TABLE public.web_conversations ALTER COLUMN server_version SET NOT NULL;
ALTER TABLE public.web_messages ALTER COLUMN server_version SET NOT NULL;

-- 5. Trigger: assign a fresh version on every INSERT and UPDATE so any change
--    (including soft-delete and metadata edits) advances the sync cursor.
CREATE OR REPLACE FUNCTION public.assign_cloud_sync_version()
RETURNS trigger AS $$
BEGIN
  NEW.server_version := nextval('public.cloud_sync_version_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_web_conversations_sync_version ON public.web_conversations;
CREATE TRIGGER trg_web_conversations_sync_version
  BEFORE INSERT OR UPDATE ON public.web_conversations
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

DROP TRIGGER IF EXISTS trg_web_messages_sync_version ON public.web_messages;
CREATE TRIGGER trg_web_messages_sync_version
  BEFORE INSERT OR UPDATE ON public.web_messages
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

-- 6. Indexes for the delta-pull query (WHERE server_version > cursor ORDER BY
--    server_version). RLS still scopes rows to the authenticated user.
CREATE INDEX IF NOT EXISTS idx_web_conversations_server_version
  ON public.web_conversations(server_version);

CREATE INDEX IF NOT EXISTS idx_web_messages_server_version
  ON public.web_messages(server_version);
