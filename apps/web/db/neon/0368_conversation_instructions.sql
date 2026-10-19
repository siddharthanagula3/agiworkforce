-- =============================================================================
-- Migration 0368: instructions for one conversation
--
-- Why    : ChatGPT and Claude let a person give a chat its own standing
--          instructions without changing their account-wide ones. The text
--          applies to every turn of that conversation and nowhere else.
--
-- Shape  : web_conversations.instructions holds the text, at most 4,000
--          characters, null when the conversation has none.
-- =============================================================================

begin;

set local lock_timeout = '5s';

alter table public.web_conversations
  add column if not exists instructions text;

alter table public.web_conversations
  drop constraint if exists web_conversations_instructions_length;

alter table public.web_conversations
  add constraint web_conversations_instructions_length
  check (instructions is null or char_length(instructions) <= 4000);

comment on column public.web_conversations.instructions is
  'Standing instructions the owner gave this conversation; read into every turn of it and no other.';

commit;
