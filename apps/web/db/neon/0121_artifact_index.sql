-- =============================================================================
-- Migration: 0121_artifact_index.sql
-- Purpose  : An account-wide INDEX of derived artifacts, so the Artifacts
--            gallery can list everything a user has ever produced instead of
--            only what the current device happens to have cached.
--
-- Why this is NOT web_artifacts (0039)
-- -----------------------------------------------------------------------------
-- 0039 is the MANAGED, EDITABLE artifact entity: rows there are artifacts whose
-- content has diverged from the message that produced them (desktop edit-in-place
-- or authored-from-scratch). Its design explicitly forbids storing re-derivable
-- content: "Un-edited derived artifacts are NEVER pushed: every surface
-- re-derives them identically from the already-synced message, so pushing them
-- would duplicate state."
--
-- Web has no artifact editing, so EVERY web artifact is re-derivable. Verified
-- empirically on 2026-08-15: clearing `agi-artifacts-store` from localStorage
-- and reloading a conversation re-produced the artifact under its identical
-- deterministic id (uuidv5(conversationId:messageId:ordinal)). Nothing is lost.
--
-- What IS lost is completeness: the gallery only knows about conversations this
-- device has opened, so after a clear it showed 1 artifact where the account had
-- 4. That is a discovery problem, not a persistence problem — so the fix is an
-- INDEX, not a copy.
--
-- Model    : metadata only, NO `content` column. Content stays exactly where it
--            already lives (the synced message) and is re-derived on demand.
--            This keeps the index cheap, and — more importantly — makes it
--            impossible for the index to go stale against the message it
--            describes, because it never claims to hold the bytes.
--
--            The row is keyed by the SAME deterministic derived id the clients
--            compute, so an index row and a locally-derived artifact are the
--            same object and de-duplicate on merge without any reconciliation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.web_artifact_index (
  -- The deterministic derived id: uuidv5(conversationId:messageId:ordinal).
  -- Same id the client computes, so client-local and server-indexed artifacts
  -- merge by identity with no mapping table.
  id              UUID PRIMARY KEY,
  user_id         TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.web_conversations(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL REFERENCES public.web_messages(id) ON DELETE CASCADE,
  -- Position within its source message; part of the id's derivation input, kept
  -- so a re-index can be ordered deterministically.
  ordinal         INTEGER NOT NULL,
  title           TEXT,
  artifact_type   TEXT NOT NULL,
  language        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The gallery's only query: newest-first for one user.
CREATE INDEX IF NOT EXISTS idx_web_artifact_index_user
  ON public.web_artifact_index(user_id, created_at DESC);
-- Re-index / cleanup by source message.
CREATE INDEX IF NOT EXISTS idx_web_artifact_index_message
  ON public.web_artifact_index(message_id);

-- RLS — same shape as web_artifacts (0039) INCLUDING the FORCE that 0039
-- originally missed and 0049 had to backfill. Without FORCE, the owner role
-- bypasses RLS and any query not running as `app_rls` reads across tenants.
ALTER TABLE public.web_artifact_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_artifact_index FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_artifact_index_user_isolation ON public.web_artifact_index;
CREATE POLICY web_artifact_index_user_isolation
  ON public.web_artifact_index FOR ALL TO app_rls
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());
