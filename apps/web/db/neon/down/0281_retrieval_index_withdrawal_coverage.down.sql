BEGIN;

DROP TRIGGER IF EXISTS trg_retrieval_web_messages_removed ON public.web_messages;
DROP FUNCTION IF EXISTS public.retrieval_track_message_removal();

CREATE OR REPLACE FUNCTION public.retrieval_track_code_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
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
  AFTER INSERT OR UPDATE OF title, repository_url
  ON public.cloud_code_sessions
  FOR EACH ROW EXECUTE FUNCTION public.retrieval_track_code_session();

DELETE FROM public.schema_migrations
WHERE filename = '0281_retrieval_index_withdrawal_coverage.sql';

COMMIT;
