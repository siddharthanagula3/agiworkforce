-- Reversal of 0217, return shared projects to owner-only writes.
--
-- Editor grants already recorded in organization_project_access are left in
-- place; they simply stop conferring anything, and the settings UI shows them
-- again as the grant they are. Nothing an editor wrote is removed: the rows
-- belong to the project owner and stay readable and editable by them.

begin;

drop policy if exists project_knowledge_files_editor_delete on public.project_knowledge_files;
drop policy if exists project_knowledge_files_editor_update on public.project_knowledge_files;
drop policy if exists project_knowledge_files_editor_insert on public.project_knowledge_files;

drop trigger if exists user_projects_owner_column_guard on public.user_projects;
drop function if exists public.user_projects_owner_column_guard();

drop policy if exists user_projects_org_shared_editor_update on public.user_projects;

comment on table public.organization_project_access is
  'Per-member override on a project shared with an organization. ''none'' denies a member the share; ''read'' is the default the share already carries.';

delete from public.schema_migrations
 where filename = '0217_shared_project_editor_write.sql';

commit;
