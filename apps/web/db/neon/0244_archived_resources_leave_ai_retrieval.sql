-- 0244 : an archived resource stops being AI-retrievable.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0202's triggers forget a retrieval document when its source is soft-deleted
-- or temporary. Archive was not one of the conditions and `archived` was not
-- one of the columns the trigger fires on, so archiving a conversation, or the
-- project a knowledge file belongs to, hid it from every list and every search
-- while leaving it in the retrieval index. The model went on quoting a chat
-- the user had put away, which is the one thing archive is for.
--
-- The lifecycle contract is packages/contracts/types/src/resource-lifecycle.ts:
-- an archived resource is not listed, not searchable and not AI-retrievable,
-- while its retention clock keeps running and it stays restorable. This file
-- makes the last of those true in the database rather than only in the type.
--
-- Unarchiving re-enqueues, because the enqueue path is what the function falls
-- through to once the row is no longer archived, and the document was deleted
-- rather than marked stale. Nothing is deleted from any source table here;
-- what is removed is the derived copy, which is rebuilt on restore.
--
-- The two functions are replaced whole rather than patched so the running
-- definition is readable in one place, which is why the unchanged branches
-- appear below unchanged.
--
-- Depends: 0006 (user_projects.is_archived), 0059 (web_conversations.archived),
--          0202 (retrieval_documents, the two trigger functions)

begin;

create or replace function public.retrieval_track_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null or new.is_temporary or new.archived then
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
  if tg_op = 'UPDATE' and old.deleted_at is null and not old.is_temporary and not old.archived then
    perform public.retrieval_mark_stale('conversation', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_web_conversations on public.web_conversations;
create trigger trg_retrieval_web_conversations
  after insert or update of title, deleted_at, is_temporary, archived
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
  v_archived boolean;
begin
  if new.deleted_at is not null or new.superseded_at is not null then
    perform public.retrieval_forget_document('project_knowledge', new.id);
    return new;
  end if;
  select p.user_id, p.organization_id, p.is_archived
    into v_owner, v_organization, v_archived
    from public.user_projects p
   where p.id = new.project_id;
  if v_archived then
    perform public.retrieval_forget_document('project_knowledge', new.id);
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (old.deleted_at is null and old.superseded_at is null)
     and new.extracted_text is not distinct from old.extracted_text
     and new.file_name is not distinct from old.file_name then
    return new;
  end if;
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

-- A project's own archive flag is not on the knowledge file, so archiving the
-- project has to reach its files itself.
create or replace function public.retrieval_track_project_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  knowledge_file record;
begin
  if new.is_archived or new.deleted_at is not null then
    delete from public.retrieval_documents
     where project_knowledge_file_id in (
       select f.id from public.project_knowledge_files f where f.project_id = new.id
     );
    return new;
  end if;
  for knowledge_file in
    select f.id, f.file_name
      from public.project_knowledge_files f
     where f.project_id = new.id
       and f.deleted_at is null
       and f.superseded_at is null
  loop
    perform public.retrieval_enqueue_document(
      new.user_id, new.organization_id, 'project_knowledge',
      knowledge_file.id, knowledge_file.file_name
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_user_projects_archive on public.user_projects;
create trigger trg_retrieval_user_projects_archive
  after update of is_archived, deleted_at
  on public.user_projects
  for each row execute function public.retrieval_track_project_archive();

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. Archiving a conversation removes its retrieval document:
-- --    UPDATE public.web_conversations SET archived = true WHERE id = '<id>';
-- --    SELECT count(*) FROM public.retrieval_documents WHERE conversation_id = '<id>';
-- --    EXPECT: 0
--
-- -- 2. Unarchiving puts it back, queued rather than indexed:
-- --    UPDATE public.web_conversations SET archived = false WHERE id = '<id>';
-- --    SELECT status FROM public.retrieval_documents WHERE conversation_id = '<id>';
-- --    EXPECT: one row, status 'pending'
--
-- -- 3. The source row itself is untouched throughout:
-- --    SELECT deleted_at, title FROM public.web_conversations WHERE id = '<id>';
-- --    EXPECT: deleted_at null, title unchanged
--
-- -- 4. Archiving a project removes its knowledge documents and no others:
-- --    UPDATE public.user_projects SET is_archived = true WHERE id = '<project>';
-- --    SELECT count(*) FROM public.retrieval_documents d
-- --      JOIN public.project_knowledge_files f ON f.id = d.project_knowledge_file_id
-- --     WHERE f.project_id = '<project>';
-- --    EXPECT: 0
-- =============================================================================
