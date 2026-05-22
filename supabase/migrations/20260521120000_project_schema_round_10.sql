-- 20260521120000_project_schema_round_10.sql
--
-- Round-10 project-schema backend. Completes the cross-language contract
-- defined in:
--   - TS: packages/types/src/suite-contracts.ts (ProjectRecord + companions)
--   - Rust: crates/agiworkforce-protocol/src/projects.rs (Rust mirror)
-- so Web/Desktop/Mobile and future cloud services have a real Postgres
-- shape backing the typed contract.
--
-- This migration is additive only:
--   1. Extends the existing public.user_projects table with the round-10
--      fields (default_privacy_mode, default_provider_mode, allowed_surfaces,
--      default_model_id, last_used_at, icon_emoji, accent_color, imported_from,
--      organization_id). instructions/color/is_archived already exist.
--   2. Creates public.project_members (project_id, user_id, role) so members
--      can be invited beyond the owner. Owner row backfilled from existing
--      user_projects.user_id.
--   3. Creates public.project_knowledge_files for project-scoped knowledge
--      uploads (separate from chat attachments).
--
-- RLS posture mirrors the existing user_projects policies:
--   - Owners + members can read/write their projects' knowledge files and
--     member rows.
--   - Service role retains full access.
--
-- Sync-rule reminder: per the /goal locked decision, consumer chat sync is
-- Web/Desktop/Mobile only. project_members has no surface restriction —
-- membership is a profile-level concept and applies across all surfaces a
-- user is authenticated on. The sync restriction is enforced higher up in
-- the chat-history pipeline, not at the project metadata layer.

-- =============================================================================
-- 1. Extend user_projects with round-10 fields
-- =============================================================================

ALTER TABLE public.user_projects
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_privacy_mode text NOT NULL DEFAULT 'local'
    CHECK (default_privacy_mode IN ('local', 'byok', 'managed')),
  ADD COLUMN IF NOT EXISTS default_provider_mode text NOT NULL DEFAULT 'Local'
    CHECK (default_provider_mode IN ('Local', 'DirectByok', 'ManagedGateway', 'ManagedNative')),
  ADD COLUMN IF NOT EXISTS allowed_surfaces text[] NOT NULL DEFAULT ARRAY['web', 'desktop', 'mobile']::text[],
  ADD COLUMN IF NOT EXISTS default_model_id text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS icon_emoji text,
  ADD COLUMN IF NOT EXISTS accent_color text
    CHECK (accent_color IS NULL OR accent_color IN ('emerald', 'sky', 'amber', 'rose', 'violet', 'zinc')),
  ADD COLUMN IF NOT EXISTS imported_from text
    CHECK (imported_from IS NULL OR imported_from IN ('claude', 'openai', 'manual'));

-- Validate allowed_surfaces values via a separate check (Postgres can't
-- check array element membership inside ADD COLUMN CHECK on jsonb-style).
-- This catches typos like 'desktopp' at insert time.
ALTER TABLE public.user_projects
  ADD CONSTRAINT user_projects_allowed_surfaces_valid CHECK (
    allowed_surfaces <@ ARRAY['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome']::text[]
  ) NOT VALID;

-- Validate existing rows in a separate pass — NOT VALID above lets us add
-- the constraint without scanning the table, then validate it in the
-- background.
ALTER TABLE public.user_projects
  VALIDATE CONSTRAINT user_projects_allowed_surfaces_valid;

CREATE INDEX IF NOT EXISTS idx_user_projects_organization_id
  ON public.user_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_last_used_at
  ON public.user_projects(last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_user_projects_imported_from
  ON public.user_projects(imported_from)
  WHERE imported_from IS NOT NULL;

-- =============================================================================
-- 2. project_members — invited collaborators beyond the owner
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id
  ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON public.project_members(user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Owners + members can read membership rows for their own projects.
CREATE POLICY "Members can read own project members" ON public.project_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.id = project_members.project_id
        AND up.user_id = auth.uid()
    )
  );

-- Only project owners can write membership rows.
CREATE POLICY "Owners can write project members" ON public.project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.id = project_members.project_id
        AND up.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.id = project_members.project_id
        AND up.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on project_members" ON public.project_members
  FOR ALL USING (auth.role() = 'service_role');

-- Backfill owner membership rows from existing user_projects so the owner
-- always appears in project_members. The ON CONFLICT clause makes this
-- idempotent across reruns of this migration.
INSERT INTO public.project_members (project_id, user_id, role, added_at)
SELECT up.id, up.user_id, 'owner', up.created_at
FROM public.user_projects up
WHERE up.user_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

-- =============================================================================
-- 3. project_knowledge_files — project-scoped knowledge uploads
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_count bigint NOT NULL CHECK (byte_count >= 0),
  checksum_sha256 text NOT NULL,
  summary text,
  source_surface text NOT NULL DEFAULT 'web'
    CHECK (source_surface IN ('web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome')),
  added_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  retention_expires_at timestamptz,
  deleted_at timestamptz,
  -- Storage path; the actual binary lives in Supabase Storage. We store
  -- the storage URI here so consumers don't have to reconstruct it.
  storage_uri text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_knowledge_files_project_id
  ON public.project_knowledge_files(project_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_knowledge_files_added_at
  ON public.project_knowledge_files(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_files_added_by
  ON public.project_knowledge_files(added_by_user_id);

ALTER TABLE public.project_knowledge_files ENABLE ROW LEVEL SECURITY;

-- Project owners + members can read knowledge files; owners + editors can
-- write (viewers cannot upload).
CREATE POLICY "Project members can read knowledge files" ON public.project_knowledge_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_knowledge_files.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project editors can write knowledge files" ON public.project_knowledge_files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_knowledge_files.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_knowledge_files.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Service role full access on project_knowledge_files" ON public.project_knowledge_files
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- 4. Denormalized counts via triggers
-- =============================================================================
--
-- The TS contract exposes knowledge_file_count + member_count on
-- ProjectRecord for cheap header rendering. Keep these denormalized so the
-- /projects view doesn't have to fan out to count(*) every project. The
-- triggers below keep the counts in sync with the source-of-truth tables.

ALTER TABLE public.user_projects
  ADD COLUMN IF NOT EXISTS knowledge_file_count integer NOT NULL DEFAULT 0
    CHECK (knowledge_file_count >= 0),
  ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 0
    CHECK (member_count >= 0);

-- Backfill counts from existing rows so the columns are accurate
-- immediately after this migration runs.
UPDATE public.user_projects up
SET
  knowledge_file_count = COALESCE((
    SELECT COUNT(*) FROM public.project_knowledge_files pkf
    WHERE pkf.project_id = up.id AND pkf.deleted_at IS NULL
  ), 0),
  member_count = COALESCE((
    SELECT COUNT(*) FROM public.project_members pm
    WHERE pm.project_id = up.id
  ), 0);

CREATE OR REPLACE FUNCTION public.update_project_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_projects
      SET member_count = member_count + 1
      WHERE id = NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_projects
      SET member_count = GREATEST(member_count - 1, 0)
      WHERE id = OLD.project_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_project_member_count ON public.project_members;
CREATE TRIGGER trigger_project_member_count
  AFTER INSERT OR DELETE ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_member_count();

CREATE OR REPLACE FUNCTION public.update_project_knowledge_file_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    UPDATE public.user_projects
      SET knowledge_file_count = knowledge_file_count + 1
      WHERE id = NEW.project_id;
  ELSIF TG_OP = 'DELETE' AND OLD.deleted_at IS NULL THEN
    UPDATE public.user_projects
      SET knowledge_file_count = GREATEST(knowledge_file_count - 1, 0)
      WHERE id = OLD.project_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft-delete: NULL → timestamp decrements; reverse increments.
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.user_projects
        SET knowledge_file_count = GREATEST(knowledge_file_count - 1, 0)
        WHERE id = NEW.project_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.user_projects
        SET knowledge_file_count = knowledge_file_count + 1
        WHERE id = NEW.project_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_project_knowledge_file_count ON public.project_knowledge_files;
CREATE TRIGGER trigger_project_knowledge_file_count
  AFTER INSERT OR UPDATE OR DELETE ON public.project_knowledge_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_knowledge_file_count();
