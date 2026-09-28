-- Reversal of 0315 : shared projects are open to the whole workspace again.
--
-- WHAT THIS COSTS: a project shared with invited members only cannot exist
-- under the old constraint, so each one is unshared from its workspace; its
-- owner keeps it and can share it again. The per-member grants on those
-- projects go with the share (they reference it). Whole-workspace shares and
-- their grants are untouched.

begin;

delete from public.organization_shared_projects
 where default_access = 'none';

drop policy if exists user_projects_org_shared_read on public.user_projects;
create policy user_projects_org_shared_read
  on public.user_projects for select to app_rls
  using (
    exists (
      select 1
        from public.organization_shared_projects s
       where s.project_id = user_projects.id
         and public.app_org_resource_is_readable(s.organization_id)
         and not exists (
           select 1
             from public.organization_project_access a
            where a.organization_id = s.organization_id
              and a.project_id = s.project_id
              and a.user_id = public.current_app_user_id()
              and a.access = 'none'
         )
    )
  );

drop policy if exists project_knowledge_files_shared_read on public.project_knowledge_files;
create policy project_knowledge_files_shared_read
  on public.project_knowledge_files
  for select to app_rls
  using (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
    or project_id in (
      select s.project_id
        from public.organization_shared_projects s
       where public.app_org_resource_is_readable(s.organization_id)
         and not exists (
           select 1
             from public.organization_project_access a
            where a.organization_id = s.organization_id
              and a.project_id = s.project_id
              and a.user_id = public.current_app_user_id()
              and a.access = 'none'
         )
    )
  );

alter table public.organization_shared_projects
  drop constraint if exists organization_shared_projects_default_access_check,
  add constraint organization_shared_projects_default_access_check
    check (default_access in ('read', 'write'));

comment on column public.organization_shared_projects.default_access is null;

delete from public.schema_migrations
 where filename = '0315_private_shared_projects.sql';

commit;
