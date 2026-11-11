begin;
lock table public.project_knowledge_files in share row exclusive mode;
do $$
begin
  if exists (select 1 from public.project_knowledge_objects where state <> 'referenced') then
    raise exception 'Cannot roll back object lifecycle after a reference retirement; reconcile cleanup receipts before changing this fence';
  end if;
end
$$;
drop trigger project_knowledge_object_scope on public.user_projects;
drop function public.app_project_content_held(uuid, text);
drop function public.guard_project_knowledge_object_scope();
drop trigger project_knowledge_object_reference on public.project_knowledge_files;
drop function public.track_project_knowledge_object_reference();
drop function public.claim_project_knowledge_object_cleanup(text, jsonb, integer);
drop function public.renew_project_knowledge_object_cleanup(text, uuid, integer);
drop function public.record_project_knowledge_object_cleanup(text, uuid, text);
drop table public.project_knowledge_objects;
drop function public.project_knowledge_object_fingerprint(text);
alter table public.project_knowledge_files drop column storage_targets;
drop function public.valid_project_knowledge_storage_targets(jsonb);
delete from public.schema_migrations where filename = '0419_project_knowledge_object_lifecycle.sql';
commit;
