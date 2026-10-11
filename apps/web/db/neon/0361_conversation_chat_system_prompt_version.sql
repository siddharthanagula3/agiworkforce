-- =============================================================================
-- Migration 0361: remember the chat system prompt version a conversation began on
--
-- Why    : a new chat system prompt version must reach new conversations only.
--          Changing the system text under a conversation already under way
--          changes its behaviour mid-thread, and a provider that replays signed
--          reasoning can reject what is sent back. The version was global, so
--          moving the pin moved every open conversation with it.
--
-- Shape  : web_conversations gains chat_system_prompt_version, written once by
--          the chat route on the conversation's first turn and read on every
--          later one. Null means the conversation began before versions were
--          recorded; it keeps the legacy version, so no backfill is needed.
--
-- Lock   : a nullable column with no default is a catalog-only change, so the
--          exclusive lock on web_conversations is held for milliseconds. The
--          lock_timeout makes a contended apply fail fast instead of queueing
--          every chat behind it.
-- =============================================================================

begin;

set local lock_timeout = '5s';

alter table public.web_conversations
  add column if not exists chat_system_prompt_version smallint;

commit;
