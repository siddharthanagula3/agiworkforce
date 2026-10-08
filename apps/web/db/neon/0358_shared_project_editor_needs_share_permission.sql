-- =============================================================================
-- Migration 0358: an edit grant on a shared project needs a role that shares
--
-- Why    : 0200 made Viewer read-only, and the grant table's insert policy
--          refuses a write grant to anyone whose role lacks content.share
--          (app_org_member_may_hold_write). A member moved to Viewer after the
--          grant was made keeps the row, and the four 0217 editor policies
--          checked only the row, so the old grant still let them change the
--          project record and its knowledge files.
--
-- Shape  : re-states the four 0217 editor policies with one more condition,
--          that the caller still holds content.share in the sharing
--          organization. Nothing else changes; grant rows are left in place
--          and count again if the member's role regains content.share.
--
-- Depends: 0200 (app_has_org_permission), 0217 (editor policies)
-- =============================================================================

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
         and public.app_has_org_permission(s.organization_id, 'content.share')
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
         and public.app_has_org_permission(s.organization_id, 'content.share')
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
         and public.app_has_org_permission(s.organization_id, 'content.share')
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
         and public.app_has_org_permission(s.organization_id, 'content.share')
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
         and public.app_has_org_permission(s.organization_id, 'content.share')
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
         and public.app_has_org_permission(s.organization_id, 'content.share')
         and public.app_org_resource_is_readable(s.organization_id)
    )
  );

commit;
