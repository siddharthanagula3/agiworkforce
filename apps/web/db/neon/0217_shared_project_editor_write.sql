-- 0217 : make the editor grant on a shared project real in the database.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- `organization_project_access.access` has carried 'write' since 0086, and 0086
-- said so itself: "members READ knowledge files on a shared project; only the
-- owner WRITES them. Widening write is a separate decision." This is that
-- decision. Until now the value was unreachable — the settings UI offered only
-- 'read' and 'none', and every write policy demanded ownership — so a project
-- could be shared but never co-edited.
--
-- What an editor may change is deliberately narrower than what an owner may:
--
--   user_projects              UPDATE   (name, instructions, appearance)
--   project_knowledge_files    INSERT, UPDATE, DELETE
--
-- and nothing else. INSERT and DELETE on user_projects stay owner-only, so an
-- editor cannot create a project inside someone else's account nor delete or
-- archive the one they were given. The grant is per member and explicit: the
-- share row's own `default_access` never confers write, so raising a project's
-- default can never hand the whole organization edit rights.
--
-- The UPDATE policy cannot express "and the owner column did not change" —
-- RLS has no OLD row — so a trigger carries that: only the current owner may
-- move a project to another user or another organization. Without it an editor
-- could satisfy the policy while rewriting user_id and taking the project.
--
-- DELETE on project_knowledge_files is the permission 0090 took away from every
-- member, and it is reinstated here only for a member holding an explicit write
-- grant. An ordinary member, a viewer, and a member with no grant still cannot
-- delete another person's extracted files.
--
-- No new table, so no new erasure entry and no new export entry: both tables
-- are already classified, and the rows an editor writes belong to the project
-- owner exactly as the owner's own rows do.

begin;

drop policy if exists user_projects_org_shared_editor_update on public.user_projects;
create policy user_projects_org_shared_editor_update
  on public.user_projects for update to app_rls
  using (
    exists (
      select 1
        from public.organization_shared_projects s
        join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
       where s.project_id = user_projects.id
         and a.user_id = public.current_app_user_id()
         and a.access = 'write'
         and public.app_org_resource_is_readable(s.organization_id)
    )
  )
  with check (
    exists (
      select 1
        from public.organization_shared_projects s
        join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
       where s.project_id = user_projects.id
         and a.user_id = public.current_app_user_id()
         and a.access = 'write'
         and public.app_org_resource_is_readable(s.organization_id)
    )
  );

create or replace function public.user_projects_owner_column_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.user_id is distinct from old.user_id
      or new.organization_id is distinct from old.organization_id)
     and old.user_id is distinct from public.current_app_user_id() then
    raise exception 'only the project owner may move a project to another owner or organization'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_projects_owner_column_guard on public.user_projects;
create trigger user_projects_owner_column_guard
  before update on public.user_projects
  for each row execute function public.user_projects_owner_column_guard();

drop policy if exists project_knowledge_files_editor_insert on public.project_knowledge_files;
create policy project_knowledge_files_editor_insert
  on public.project_knowledge_files for insert to app_rls
  with check (
    project_id in (
      select s.project_id
        from public.organization_shared_projects s
        join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
       where a.user_id = public.current_app_user_id()
         and a.access = 'write'
         and public.app_org_resource_is_readable(s.organization_id)
    )
  );

drop policy if exists project_knowledge_files_editor_update on public.project_knowledge_files;
create policy project_knowledge_files_editor_update
  on public.project_knowledge_files for update to app_rls
  using (
    project_id in (
      select s.project_id
        from public.organization_shared_projects s
        join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
       where a.user_id = public.current_app_user_id()
         and a.access = 'write'
         and public.app_org_resource_is_readable(s.organization_id)
    )
  )
  with check (
    project_id in (
      select s.project_id
        from public.organization_shared_projects s
        join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
       where a.user_id = public.current_app_user_id()
         and a.access = 'write'
         and public.app_org_resource_is_readable(s.organization_id)
    )
  );

drop policy if exists project_knowledge_files_editor_delete on public.project_knowledge_files;
create policy project_knowledge_files_editor_delete
  on public.project_knowledge_files for delete to app_rls
  using (
    project_id in (
      select s.project_id
        from public.organization_shared_projects s
        join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
       where a.user_id = public.current_app_user_id()
         and a.access = 'write'
         and public.app_org_resource_is_readable(s.organization_id)
    )
  );

comment on table public.organization_project_access is
  'Per-member override on a project shared with an organization. ''none'' denies a member the share; ''write'' is the editor grant that lets that member change the project record and its knowledge files (0217); ''read'' is the default the share already carries.';

commit;
