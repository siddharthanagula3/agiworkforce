-- Reversal of 0361 : conversations no longer remember the chat system prompt
-- version they began on.
--
-- WHAT THIS COSTS: every conversation is served the pinned version again, so a
-- conversation that began on an older version has its system text changed on
-- its next turn.

begin;

alter table public.web_conversations drop column if exists chat_system_prompt_version;

delete from public.schema_migrations
 where filename = '0361_conversation_chat_system_prompt_version.sql';

commit;
