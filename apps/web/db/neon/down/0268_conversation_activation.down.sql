-- Reversal of 0268 : drops the conversation activation stamp.
--
-- WHAT THIS COSTS: nothing a reader can see, but any cleanup job that deletes
-- never-used conversations loses the only field that distinguishes one from a
-- conversation whose messages were deleted. Stop that job before running this,
-- or it will either delete nothing or fall back to an inference this column
-- was added to replace.

begin;

drop index if exists public.web_conversations_never_activated_idx;

alter table public.web_conversations
  drop column if exists activated_at;

delete from public.schema_migrations
 where filename = '0268_conversation_activation.sql';

commit;
