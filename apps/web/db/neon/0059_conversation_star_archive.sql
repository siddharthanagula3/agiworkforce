-- =============================================================================
-- Migration: 0059_conversation_star_archive.sql
-- Purpose  : Persist the Sidebar Star and Archive conversation controls
--            (WEB-STAR-ARCHIVE-NONPERSIST-01). The web UI has shipped both
--            affordances client-side only; state was lost on reload. Mirrors
--            the existing `pinned` column pattern from 0001_mvp_chat.sql.
--
-- COORDINATION: ADDITIVE ONLY. Apply BEFORE deploying code that selects or
--            updates these columns (same sequencing class as 0056; see
--            SVC-MANAGED-USAGE-0056-DEPLOY-SEQ-01 in known-flaws.md).
--
-- Idempotent: safe to re-run (IF NOT EXISTS).
--
-- NOT YET APPLIED — pending the pre-merge migration pass (0056 -> 0057 ->
--            0058 -> 0059) against prod Neon.
-- =============================================================================

ALTER TABLE public.web_conversations
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

ALTER TABLE public.web_conversations
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
