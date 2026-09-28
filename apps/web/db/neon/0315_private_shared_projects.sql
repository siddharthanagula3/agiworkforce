-- =============================================================================
-- Migration 0315: a shared project can be open to invited members only
--
-- Why    : sharing a project opened it to every member of the workspace, and
--          the only narrowing was denying members one at a time. Claude's
--          private projects open only to the people invited, with Can view or
--          Can edit each; a whole-workspace project stays the other choice.
--
-- Shape  : organization_shared_projects.default_access also accepts 'none',
--          meaning a member sees the project only with an explicit read or
--          write grant in organization_project_access. A member's effective
--          access is coalesce(their grant, the share's default); 'none' in
--          either place hides the project. The two read policies that decide
--          visibility (user_projects_org_shared_read from 0086,
--          project_knowledge_files_shared_read from 0090) now apply that rule.
--          Write stays an explicit per-member grant (0217) and is unchanged.
--
-- Depends: 0086, 0090, 0200 (app_org_resource_is_readable), 0217
-- =============================================================================

begin;

alter table public.organization_shared_projects
  drop constraint if exists organization_shared_projects_default_access_check,
  add constraint organization_shared_projects_default_access_check
    check (default_access in ('read', 'write', 'none'));

drop policy if exists user_projects_org_shared_read on public.user_projects;
create policy user_projects_org_shared_read
  on public.user_projects for select to app_rls
  using (
    exists (
      select 1
        from public.organization_shared_projects s
        left join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
         and a.user_id = public.current_app_user_id()
       where s.project_id = user_projects.id
         and public.app_org_resource_is_readable(s.organization_id)
         and coalesce(a.access, s.default_access) <> 'none'
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
        left join public.organization_project_access a
          on a.organization_id = s.organization_id
         and a.project_id = s.project_id
         and a.user_id = public.current_app_user_id()
       where public.app_org_resource_is_readable(s.organization_id)
         and coalesce(a.access, s.default_access) <> 'none'
    )
  );

comment on column public.organization_shared_projects.default_access is
  'Access a member has without a grant of their own: read opens the project to the workspace, none opens it only to members with an explicit read or write grant.';

commit;
