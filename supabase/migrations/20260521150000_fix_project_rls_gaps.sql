-- 20260521150000_fix_project_rls_gaps.sql
--
-- Self-audit follow-up for 20260521120000_project_schema_round_10.sql.
-- Two RLS gaps:
--
--   1. project_knowledge_files SELECT policy doesn't filter
--      `deleted_at IS NULL`. Soft-deleted files therefore remain
--      visible to project members — defeats the purpose of the
--      soft-delete column. Apps that forget to filter `deleted_at`
--      will leak deleted files into UIs.
--
--   2. project_members SELECT policy only allows reading own row OR
--      project owner. Non-owner members CANNOT see other
--      collaborators on the same project. Breaks the "collaboration
--      list" UX every projects feature ships.
--
-- This migration drops + recreates the affected policies. Existing
-- writers (FOR ALL with owner / editor checks) are untouched.

-- =============================================================================
-- Fix #1: project_knowledge_files SELECT respects soft-delete
-- =============================================================================

DROP POLICY IF EXISTS "Project members can read knowledge files" ON public.project_knowledge_files;

CREATE POLICY "Project members can read non-deleted knowledge files"
  ON public.project_knowledge_files
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_knowledge_files.project_id
        AND pm.user_id = auth.uid()
    )
  );

-- A service-role consumer that needs to view trash explicitly bypasses
-- RLS, so the "Service role full access" policy already handles deleted
-- rows for admin / trash views.

-- =============================================================================
-- Fix #2: project_members SELECT visible to all project members
-- =============================================================================

DROP POLICY IF EXISTS "Members can read own project members" ON public.project_members;

CREATE POLICY "Project members can read all project members"
  ON public.project_members
  FOR SELECT
  USING (
    -- The reader is themselves a member of this project (any role).
    EXISTS (
      SELECT 1 FROM public.project_members own
      WHERE own.project_id = project_members.project_id
        AND own.user_id = auth.uid()
    )
    -- OR the reader owns the project (still works during the brief
    -- window when the owner row is being backfilled).
    OR EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.id = project_members.project_id
        AND up.user_id = auth.uid()
    )
  );
