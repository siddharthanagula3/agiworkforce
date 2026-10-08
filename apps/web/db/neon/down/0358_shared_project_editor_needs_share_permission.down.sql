-- Reversal of 0358 : the 0217 editor policies stop checking the caller's role.
--
-- WHAT THIS COSTS: a member moved to Viewer who still holds an edit grant on a
-- shared project can change that project and its knowledge files again.

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

delete from public.schema_migrations
 where filename = '0358_shared_project_editor_needs_share_permission.sql';

commit;
