-- Reversal of 0368 : conversations lose their own instructions.
--
-- WHAT THIS COSTS: every instruction a person gave a single conversation is
-- deleted, and those chats answer with only the account and project
-- instructions again.

begin;

alter table public.web_conversations
  drop constraint if exists web_conversations_instructions_length;

alter table public.web_conversations drop column if exists instructions;

delete from public.schema_migrations
 where filename = '0368_conversation_instructions.sql';

commit;
