-- =============================================================================
-- Migration 0281: the retrieval index follows its sources out of reach
--
-- Why    : A retrieval chunk is the resource in the form a model reads back,
--          and search never joins the source row, so the index is the only
--          thing standing between withdrawn content and a model context. Two
--          ways out were missing.
--
--          A message removed by the chat surface is removed outright, and the
--          trigger that keeps a conversation document fresh fires on INSERT and
--          UPDATE only. Nothing marks the document stale, so its chunks keep
--          serving the deleted turn until some other message of the same
--          conversation happens to change.
--
--          An archived developer session is declared not searchable and not
--          retrievable by the shared lifecycle contract, but `archived_at` is
--          not one of the columns its trigger watches, so archiving neither
--          retires the document nor schedules a rebuild.
--
-- What   : an AFTER DELETE trigger on web_messages that marks the conversation
--          document stale, and archived_at added to the session trigger with a
--          branch that forgets the document the way every other source already
--          does on withdrawal.
--
-- Backfill: documents already holding a removed message are marked stale, and
--          documents of already-archived sessions are deleted.
--
-- destructive: the retrieval documents of already-archived developer sessions
--          are deleted, taking their chunks and embeddings with them. That is
--          the point: the shared contract says an archived resource is neither
--          searchable nor retrievable, and these rows are the copy that made it
--          both. Nothing else reads them, and unarchiving a session re-enqueues
--          the document, which the indexer rebuilds from the session itself.
--
-- Depends: 0001 (web_messages), 0075 (cloud_code_sessions), 0176
--          (cloud_code_sessions.archived_at), 0202 (retrieval index)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.retrieval_track_message_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  -- A cascade from the conversation has already taken the document with it.
  if not exists (
    select 1 from public.web_conversations c where c.id = old.conversation_id
  ) then
    return old;
  end if;
  perform public.retrieval_mark_stale('conversation', old.conversation_id);
  return old;
end;
$$;

DROP TRIGGER IF EXISTS trg_retrieval_web_messages_removed ON public.web_messages;
CREATE TRIGGER trg_retrieval_web_messages_removed
  AFTER DELETE ON public.web_messages
  FOR EACH ROW EXECUTE FUNCTION public.retrieval_track_message_removal();

CREATE OR REPLACE FUNCTION public.retrieval_track_code_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if new.archived_at is not null then
    perform public.retrieval_forget_document('developer_session', new.id);
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    new.user_id, new.organization_id, 'developer_session', new.id, new.title
  );
  if tg_op = 'UPDATE' then
    perform public.retrieval_mark_stale('developer_session', new.id);
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_retrieval_cloud_code_sessions ON public.cloud_code_sessions;
CREATE TRIGGER trg_retrieval_cloud_code_sessions
  AFTER INSERT OR UPDATE OF title, repository_url, archived_at
  ON public.cloud_code_sessions
  FOR EACH ROW EXECUTE FUNCTION public.retrieval_track_code_session();

UPDATE public.retrieval_documents d
   SET status = 'stale', next_attempt_at = now(), updated_at = now()
 WHERE d.source_kind = 'conversation'
   AND d.status IN ('indexed', 'indexing', 'failed')
   AND EXISTS (
     SELECT 1
       FROM public.retrieval_chunks c
      WHERE c.document_id = d.id
        AND c.metadata ->> 'messageId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (
          SELECT 1
            FROM public.web_messages m
           WHERE m.id = (c.metadata ->> 'messageId')::uuid
             AND m.deleted_at IS NULL
        )
   );

DELETE FROM public.retrieval_documents
 WHERE source_kind = 'developer_session'
   AND cloud_code_session_id IN (
     SELECT id FROM public.cloud_code_sessions WHERE archived_at IS NOT NULL
   );

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No archived session is still indexed:
-- --    SELECT count(*) FROM public.retrieval_documents d
-- --      JOIN public.cloud_code_sessions s ON s.id = d.cloud_code_session_id
-- --     WHERE s.archived_at IS NOT NULL;                         -- EXPECT: 0
--
-- -- 2. No chunk names a message that no longer exists, once the sweep drains:
-- --    SELECT count(*) FROM public.retrieval_chunks c
-- --     WHERE c.source_kind = 'conversation'
-- --       AND c.metadata ? 'messageId'
-- --       AND NOT EXISTS (SELECT 1 FROM public.web_messages m
-- --                        WHERE m.id = (c.metadata ->> 'messageId')::uuid
-- --                          AND m.deleted_at IS NULL);           -- EXPECT: 0
--
-- -- 3. Deleting a message schedules its conversation for a rebuild:
-- --    DELETE FROM public.web_messages WHERE id = '<a message id>';
-- --    SELECT status FROM public.retrieval_documents
-- --     WHERE conversation_id = '<its conversation>';       -- EXPECT: stale
