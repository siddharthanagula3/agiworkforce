-- =============================================================================
-- Migration 0344: remember that a conversation holds Google user data
--
-- Why    : Google API Limited Use forbids sending Google user data to a model
--          provider that may train on it. The result of a Gmail, Google
--          Calendar, Google Drive or Google Contacts tool call stays in the
--          conversation history, so every later turn in that conversation,
--          text the user pastes included, carries it too.
--
-- Shape  : web_conversations gains google_user_data_at, set by the server the
--          first time a Google connector runs in the conversation or a turn
--          reads a project source imported from one. It is never cleared, and
--          while it is set every turn routes only to providers that keep
--          inputs out of training.
--
-- Lock   : a nullable column with no default is a catalog-only change, so the
--          exclusive lock on web_conversations is held for milliseconds. The
--          lock_timeout makes a contended apply fail fast instead of queueing
--          every chat behind it.
--
-- Backfill: conversations that already hold Google data are marked by
--          scripts/backfill-google-user-data-mark.mjs in short batches after
--          this migration applies, never inside it. Until that runs, routing
--          still forces no-training on any turn whose history carries a Google
--          tool call.
-- =============================================================================

begin;

set local lock_timeout = '5s';

alter table public.web_conversations
  add column if not exists google_user_data_at timestamptz;

commit;
