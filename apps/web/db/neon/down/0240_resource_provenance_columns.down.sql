-- Reversal of 0240, remove resource provenance columns.
--
-- COST, read this before running it: dropping created_by, updated_by and
-- origin_surface discards every attribution recorded since 0240 was applied.
-- Who moved a conversation, who last wrote a message and which surface
-- produced it are not derivable from anything else, so export the three
-- columns first if any audit or support answer has ever relied on them.

begin;

drop trigger if exists trg_web_messages_provenance on public.web_messages;
drop trigger if exists trg_web_conversations_provenance on public.web_conversations;

drop function if exists public.set_resource_provenance();

drop index if exists public.idx_web_conversations_created_by;

alter table public.web_messages
  drop constraint if exists web_messages_origin_surface_check;

alter table public.web_conversations
  drop constraint if exists web_conversations_origin_surface_check;

alter table public.web_messages
  drop column if exists origin_surface,
  drop column if exists updated_by,
  drop column if exists created_by;

alter table public.web_conversations
  drop column if exists origin_surface,
  drop column if exists updated_by,
  drop column if exists created_by;

delete from public.schema_migrations
 where filename = '0240_resource_provenance_columns.sql';

commit;
