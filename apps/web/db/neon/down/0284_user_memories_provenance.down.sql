-- Reversal of memory provenance.
--
-- COST, read this before running it: every memory loses the record of where it
-- was learned, so a user who deletes a conversation can no longer be shown what
-- that conversation taught Memory, and an extracted fact can no longer be told
-- apart from one the user typed in. The memories themselves are untouched.

begin;

drop index if exists public.idx_user_memories_source_conversation;

alter table public.user_memories
  drop column if exists source_conversation_id,
  drop column if exists source_turn_id,
  drop column if exists provenance;

-- destructive: removes this migration's ledger row so the runner can apply it again.
delete from public.schema_migrations
 where filename = '0284_user_memories_provenance.sql';

commit;
