-- =============================================================================
-- Migration 0280: a cached compaction summary answers for what it covers
--
-- Why    : `compaction_summary` is written by the chat completions compaction
--          path and cleared by nothing. It is keyed only on the id of the last
--          message it covers, so a message deleted or edited anywhere earlier
--          in the span leaves that key unchanged. The stale summary is then
--          reused, and extended, on every later turn of the conversation, which
--          puts withdrawn words back into the model prompt for the life of the
--          thread.
--
-- What   : `compaction_summary_digest`, a sha256 over the ordered visible
--          message ids of the covered span and the row version each had when
--          the summary was written. The reader recomputes it and reuses the
--          summary only on a match, so the cache validates itself instead of
--          depending on every present and future delete path to remember it.
--
-- Backfill: every summary written before this column existed is cleared. There
--          is no digest to check them against and no way to tell which of them
--          already hold deleted content, so they are rebuilt from the visible
--          span on the next turn that needs one.
--
-- Depends: 0001 (web_conversations), 0164 (compaction_summary)
-- =============================================================================

BEGIN;

ALTER TABLE public.web_conversations
  ADD COLUMN IF NOT EXISTS compaction_summary_digest text
    CHECK (compaction_summary_digest IS NULL OR compaction_summary_digest ~ '^[a-f0-9]{64}$');

COMMENT ON COLUMN public.web_conversations.compaction_summary_digest IS
  'sha256 over the ordered visible message ids of the span compaction_summary covers and the server_version each held when it was written. The summary is reused only while a freshly computed digest matches, so a deleted or edited message in the span retires it.';

UPDATE public.web_conversations
   SET compaction_summary = NULL,
       compaction_summary_through_message_id = NULL
 WHERE compaction_summary IS NOT NULL
    OR compaction_summary_through_message_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No summary survives without a digest to check it against:
-- --    SELECT count(*) FROM public.web_conversations
-- --     WHERE compaction_summary IS NOT NULL AND compaction_summary_digest IS NULL;
-- --                                                              -- EXPECT: 0
--
-- -- 2. The column refuses anything that is not a sha256 hex digest:
-- --    UPDATE public.web_conversations SET compaction_summary_digest = 'nope'
-- --     WHERE id = (SELECT id FROM public.web_conversations LIMIT 1);
-- --                                        -- EXPECT: check constraint violation
