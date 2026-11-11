-- =============================================================================
-- Migration 0410: a message written during indexing queues a refresh
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : The trigger on web_messages marked a conversation document stale
--          only from 'indexed' or 'failed'. A message committed while a worker
--          was indexing that conversation (status 'indexing') changed nothing,
--          so the run finished against the earlier text, settled the document
--          as indexed, and the new message was never queued for a refresh.
--          retrieval_mark_stale, which every other source uses, already
--          includes 'indexing'.
--
-- Shape  : create or replace of retrieval_track_message with the same
--          signature, owner, security definer and search_path; its status list
--          gains 'indexing'. The trigger on web_messages is unchanged. The
--          indexer keeps a stale marker set while it runs and settles the
--          document as stale rather than indexed, then fences the run.
--
-- Empty  : no data changes. Documents indexing at the moment this applies keep
--          their status until their next message.
--
-- Depends: 0202 (retrieval index and retrieval_track_message)
-- =============================================================================

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
     and status in ('indexed', 'indexing', 'failed');
  return new;
end;
$$;

commit;
