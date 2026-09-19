-- =============================================================================
-- Migration 0268: mark when a conversation was activated by its first user turn
--
-- Why    : "empty" was only ever inferred, by asking whether any message row
--          existed. Opening the composer creates a conversation, so an account
--          accumulates rows nobody ever wrote to, and nothing could tell a
--          conversation abandoned before its first message from one whose
--          messages were later deleted. A cleanup job cannot safely delete on
--          an inference; it needs the conversation to say so itself.
--
-- What   : `activated_at`, set once by the first successful user message and
--          never cleared. Null means the conversation was never used, which is
--          the only thing a cleanup job is allowed to remove.
--
-- Backfill: every conversation that already holds a user message takes that
--          message's timestamp, so no existing conversation looks disposable.
--
-- Depends: 0001 (web_conversations, web_messages)
-- =============================================================================

BEGIN;

ALTER TABLE public.web_conversations
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

COMMENT ON COLUMN public.web_conversations.activated_at IS
  'When the first user message landed. Null means the conversation was created and never used, the only state an automated cleanup may remove.';

UPDATE public.web_conversations c
   SET activated_at = greatest(c.created_at, first_turn.first_user_message_at)
  FROM (
    SELECT conversation_id, min(created_at) AS first_user_message_at
      FROM public.web_messages
     WHERE role = 'user'
     GROUP BY conversation_id
  ) AS first_turn
 WHERE first_turn.conversation_id = c.id
   AND c.activated_at IS NULL;

CREATE INDEX IF NOT EXISTS web_conversations_never_activated_idx
  ON public.web_conversations (created_at)
  WHERE activated_at IS NULL AND deleted_at IS NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No conversation holding a user message is left looking unused:
-- --    SELECT count(*) FROM public.web_conversations c
-- --     WHERE c.activated_at IS NULL
-- --       AND EXISTS (SELECT 1 FROM public.web_messages m
-- --                    WHERE m.conversation_id = c.id AND m.role = 'user');
-- --                                                              -- EXPECT: 0
--
-- -- 2. The activation stamp never precedes the conversation:
-- --    SELECT count(*) FROM public.web_conversations
-- --     WHERE activated_at IS NOT NULL AND activated_at < created_at;
-- --                                                              -- EXPECT: 0
--
-- -- 3. The partial index is the one a cleanup job uses:
-- --    EXPLAIN SELECT id FROM public.web_conversations
-- --     WHERE activated_at IS NULL AND deleted_at IS NULL
-- --       AND created_at < now() - interval '30 days';
-- --                          -- EXPECT: web_conversations_never_activated_idx
