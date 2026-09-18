-- Reversal of 0244, let an archived resource stay AI-retrievable again.
--
-- COST, read this before running it: after this, archiving a conversation or a
-- project hides it from every list and every search while its text stays in
-- retrieval_documents, so the model goes on quoting what the user put away.
-- Documents already forgotten are not restored by this file; they are
-- re-enqueued the next time their source row is touched.

begin;

drop trigger if exists trg_retrieval_user_projects_archive on public.user_projects;
drop function if exists public.retrieval_track_project_archive();

create or replace function public.retrieval_track_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null or new.is_temporary then
    delete from public.retrieval_documents
     where conversation_id = new.id
        or artifact_id in (select a.id from public.web_artifacts a where a.conversation_id = new.id)
        or research_report_id in (
          select r.id from public.research_reports r where r.conversation_id = new.id
        );
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    new.user_id, new.organization_id, 'conversation', new.id, new.title
  );
  if tg_op = 'UPDATE' and old.deleted_at is null and not old.is_temporary then
    perform public.retrieval_mark_stale('conversation', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_web_conversations on public.web_conversations;
create trigger trg_retrieval_web_conversations
  after insert or update of title, deleted_at, is_temporary
  on public.web_conversations
  for each row execute function public.retrieval_track_conversation();

create or replace function public.retrieval_track_project_knowledge_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_organization uuid;
begin
  if new.deleted_at is not null or new.superseded_at is not null then
    perform public.retrieval_forget_document('project_knowledge', new.id);
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (old.deleted_at is null and old.superseded_at is null)
     and new.extracted_text is not distinct from old.extracted_text
     and new.file_name is not distinct from old.file_name then
    return new;
  end if;
  select p.user_id, p.organization_id into v_owner, v_organization
    from public.user_projects p
   where p.id = new.project_id;
  if v_owner is null then
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    v_owner, v_organization, 'project_knowledge', new.id, new.file_name
  );
  if tg_op = 'UPDATE' then
    perform public.retrieval_mark_stale('project_knowledge', new.id);
  end if;
  return new;
end;
$$;

delete from public.schema_migrations
 where filename = '0244_archived_resources_leave_ai_retrieval.sql';

commit;
