-- Reversal of 0409: a message written during indexing no longer queues a refresh.
--
-- WHAT THIS COSTS: the message trigger goes back to marking a conversation
-- document stale only from indexed or failed. A message committed while a
-- worker is indexing that conversation is again missed, so the document settles
-- as indexed against the earlier text and retrieval does not see the new
-- message until a later message arrives.

begin;

create or replace function public.retrieval_track_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.retrieval_documents
     set status = 'stale', next_attempt_at = now(), updated_at = now()
   where conversation_id = new.conversation_id
     and status in ('indexed', 'failed');
  return new;
end;
$$;

delete from public.schema_migrations
 where filename = '0409_retrieval_message_marks_indexing_stale.sql';

commit;
