-- =============================================================================
-- Migration: 0039_artifact_cloud_sync.sql
-- Purpose  : Managed-only cloud sync for ARTIFACTS — the third entity on the
--            cross-device sync spine (after conversations + messages), per
--            docs/plans/artifact-cloud-sync-design-2026-06-21.md (founder chose
--            "Option A: new managed-only synced artifact entity").
--
--            Makes artifacts persist identically across Web/Desktop/Mobile in
--            cloud mode. REUSES the P2 machinery — the shared
--            `cloud_sync_version_seq` + `assign_cloud_sync_version()` trigger
--            from 0038 (so ONE monotonic cursor spans conversations + messages
--            + artifacts; a single `?since=` pulls all three) and the
--            `current_app_user_id()` RLS shape from 0037.
--
-- Model    : Web + mobile artifacts are DERIVED from message content (the
--            cloud row's `id` is the deterministic
--            uuidv5(conversationId:messageId:ordinal) derived_id). Desktop
--            artifacts are first-class + editable. The cloud table holds ONLY
--            non-re-derivable artifacts (edited / desktop-authored-from-scratch);
--            un-edited derived artifacts are re-derived locally on each surface
--            and never pushed. Last-writer-wins by server_version/updated_at;
--            version history is append-only and union-merged.
--
-- Trust    : Managed-Cloud ONLY. Local/BYOK artifacts have no cloud_id and are
--            NEVER pushed/pulled (client-enforced). `user_id` is set SERVER-SIDE
--            from the JWT; RLS WITH CHECK rejects any row whose user_id != the
--            authenticated subject. Mirrors web_conversations exactly.
--
-- COORDINATION: ADDITIVE ONLY. Does NOT modify 0037 (RLS) or 0038 (versioning);
--            it reuses their sequence/trigger/helper. `user_id` is `text` to
--            match `web_conversations.user_id` (Clerk sub), NOT uuid.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / guarded).
--
-- HOW TO APPLY: Neon BRANCH first, verify with a cross-tenant probe, then prod
--            via the Neon workflow. NOT applied by writing this file.
-- =============================================================================

-- 1. web_artifacts — the canonical cloud artifact (current version).
CREATE TABLE IF NOT EXISTS public.web_artifacts (
  id              UUID PRIMARY KEY,                  -- = cloud_id; derived_id for derived artifacts
  user_id         TEXT NOT NULL,                     -- forced server-side from JWT; RLS WITH CHECK
  conversation_id UUID NOT NULL REFERENCES public.web_conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.web_messages(id) ON DELETE SET NULL, -- display-overlay backref
  title           TEXT,
  artifact_type   TEXT NOT NULL,                     -- 'html'|'react'|'svg'|'mermaid'|'code'|'document'|...
  language        TEXT,
  content         TEXT NOT NULL,                     -- current content (may diverge from the message)
  current_version INTEGER NOT NULL DEFAULT 1,
  pinned          BOOLEAN NOT NULL DEFAULT false,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,                        -- tombstone (soft delete)
  server_version  BIGINT NOT NULL DEFAULT nextval('public.cloud_sync_version_seq')
);

-- 2. web_artifact_versions — append-only version history (desktop ArtifactVersion).
CREATE TABLE IF NOT EXISTS public.web_artifact_versions (
  artifact_id        UUID NOT NULL REFERENCES public.web_artifacts(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  content            TEXT NOT NULL,
  change_description TEXT,
  content_hash       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, version)
);

-- 3. Reuse 0038's trigger fn so every INSERT/UPDATE advances the shared cursor.
--    (The DEFAULT above seeds INSERTs; the trigger also covers UPDATEs.)
DROP TRIGGER IF EXISTS trg_web_artifacts_sync_version ON public.web_artifacts;
CREATE TRIGGER trg_web_artifacts_sync_version
  BEFORE INSERT OR UPDATE ON public.web_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

-- 4. Indexes for the delta-pull query (WHERE server_version > cursor) + scoping.
CREATE INDEX IF NOT EXISTS idx_web_artifacts_server_version
  ON public.web_artifacts(server_version);
CREATE INDEX IF NOT EXISTS idx_web_artifacts_conversation
  ON public.web_artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_web_artifacts_user
  ON public.web_artifacts(user_id, updated_at DESC);

-- 5. RLS — managed-only user isolation, identical shape to web_conversations (0037).
ALTER TABLE public.web_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_artifacts_user_isolation ON public.web_artifacts;
CREATE POLICY web_artifacts_user_isolation
  ON public.web_artifacts FOR ALL TO app_rls
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- Versions inherit isolation via their parent artifact (FK + cascade); enable RLS
-- and scope through a subquery so a version row is only visible/writable when its
-- artifact belongs to the caller (same pattern web_messages uses via its conversation).
ALTER TABLE public.web_artifact_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_artifact_versions_user_isolation ON public.web_artifact_versions;
CREATE POLICY web_artifact_versions_user_isolation
  ON public.web_artifact_versions FOR ALL TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.web_artifacts a
      WHERE a.id = web_artifact_versions.artifact_id
        AND a.user_id = public.current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.web_artifacts a
      WHERE a.id = web_artifact_versions.artifact_id
        AND a.user_id = public.current_app_user_id()
    )
  );
