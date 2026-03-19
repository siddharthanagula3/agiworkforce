-- Migration: Harden user_memories table
-- Date: 2026-03-19
--
-- The user_memories table was created in 20260226100001_add_user_memories.sql
-- with a single FOR ALL policy. This migration:
--   1. Adds a content length check constraint (10000 chars max)
--   2. Changes the source default from 'mobile' to 'web' (web API context)
--   3. Replaces the broad FOR ALL policy with granular CRUD policies
--   4. Adds a service_role bypass policy for admin/background operations
--   5. Adds the missing individual column indexes for filtered queries
--   6. Attaches the shared set_updated_at() trigger

-- =============================================================================
-- 1. Add content length constraint (additive — no DROP)
-- =============================================================================
ALTER TABLE public.user_memories
  ADD CONSTRAINT user_memories_content_length
  CHECK (char_length(content) <= 10000);

-- =============================================================================
-- 2. Fix source column default (web API is the caller, not mobile)
-- =============================================================================
ALTER TABLE public.user_memories
  ALTER COLUMN source SET DEFAULT 'web';

-- =============================================================================
-- 3. Drop the overly broad FOR ALL policy and replace with CRUD policies
--
-- The original "Users can manage their own memories" policy covers all
-- operations with a single rule. Splitting into per-operation policies
-- allows the SELECT to filter is_deleted = false without blocking soft-
-- delete UPDATE/DELETE operations.
-- =============================================================================
DROP POLICY IF EXISTS "Users can manage their own memories" ON public.user_memories;

-- SELECT: only return non-deleted rows
CREATE POLICY "Users can view own memories"
  ON public.user_memories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND is_deleted = false);

-- INSERT: user may only insert their own rows
CREATE POLICY "Users can create own memories"
  ON public.user_memories
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: user may update any of their rows (including soft-delete via is_deleted)
CREATE POLICY "Users can update own memories"
  ON public.user_memories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: user may hard-delete their own rows
CREATE POLICY "Users can delete own memories"
  ON public.user_memories
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role: unrestricted access for background sync and admin operations
CREATE POLICY "Service role full access memories"
  ON public.user_memories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 4. Add missing individual-column indexes
--    The original migration only created a composite (user_id, updated_at) index
--    and a GIN full-text index. Category and source lookups are unindexed.
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id
  ON public.user_memories(user_id);

CREATE INDEX IF NOT EXISTS idx_user_memories_category
  ON public.user_memories(category);

CREATE INDEX IF NOT EXISTS idx_user_memories_source
  ON public.user_memories(source);

CREATE INDEX IF NOT EXISTS idx_user_memories_updated_at
  ON public.user_memories(updated_at DESC);

-- =============================================================================
-- 5. Attach the shared set_updated_at() trigger
--    public.set_updated_at() was introduced in 20260226200000_fix_mobile_schema.sql
-- =============================================================================
CREATE TRIGGER set_user_memories_updated_at
  BEFORE UPDATE ON public.user_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
