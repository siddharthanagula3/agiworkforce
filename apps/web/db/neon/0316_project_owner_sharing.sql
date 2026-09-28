-- =============================================================================
-- Migration 0316: a project's owner shares it and chooses who can open it
--
-- Why    : only a member with sharing.manage could share a project or change
--          who may open it, so a member could not invite a colleague to their
--          own private project. In Claude the project's owner invites people
--          to it, with Can view or Can edit each.
--
-- Shape  : additional permissive INSERT, UPDATE and DELETE policies. A member
--          holding content.share may write the organization_shared_projects
--          row of a project they own (shared_by_user_id must be them) and the
--          organization_project_access rows of that shared project; a write
--          grant still lands only on someone who may hold it (0200). Ownership
--          is read through a security-definer function, so these policies never
--          query user_projects under RLS and cannot recurse through its
--          shared-read policy. SELECT is unchanged. The sharing.manage policies
--          from 0086 and 0200 stay, so managers keep full rights and code that
--          checks for a manager keeps working.
--
-- Depends: 0086, 0200 (app_has_org_permission, app_org_member_may_hold_write),
--          0315
-- =============================================================================

begin;

create or replace function public.app_user_owns_live_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_projects p
     where p.id = target_project_id
       and p.user_id = public.current_app_user_id()
       and p.deleted_at is null
  );
$$;

revoke all on function public.app_user_owns_live_project(uuid) from public;
grant execute on function public.app_user_owns_live_project(uuid) to app_rls;

drop policy if exists organization_shared_projects_owner_insert on public.organization_shared_projects;
create policy organization_shared_projects_owner_insert
  on public.organization_shared_projects for insert to app_rls
  with check (
    public.app_has_org_permission(organization_id, 'content.share')
    and shared_by_user_id = public.current_app_user_id()
    and public.app_user_owns_live_project(project_id)
  );

drop policy if exists organization_shared_projects_owner_update on public.organization_shared_projects;
create policy organization_shared_projects_owner_update
  on public.organization_shared_projects for update to app_rls
  using (
    public.app_has_org_permission(organization_id, 'content.share')
    and public.app_user_owns_live_project(project_id)
  )
  with check (
    public.app_has_org_permission(organization_id, 'content.share')
    and shared_by_user_id = public.current_app_user_id()
    and public.app_user_owns_live_project(project_id)
  );

drop policy if exists organization_shared_projects_owner_delete on public.organization_shared_projects;
create policy organization_shared_projects_owner_delete
  on public.organization_shared_projects for delete to app_rls
  using (
    public.app_has_org_permission(organization_id, 'content.share')
    and public.app_user_owns_live_project(project_id)
  );

drop policy if exists organization_project_access_owner_insert on public.organization_project_access;
create policy organization_project_access_owner_insert
  on public.organization_project_access for insert to app_rls
  with check (
    public.app_has_org_permission(organization_id, 'content.share')
    and public.app_user_owns_live_project(project_id)
    and (
      access <> 'write'
      or public.app_org_member_may_hold_write(organization_id, user_id)
    )
  );

drop policy if exists organization_project_access_owner_update on public.organization_project_access;
create policy organization_project_access_owner_update
  on public.organization_project_access for update to app_rls
  using (
    public.app_has_org_permission(organization_id, 'content.share')
    and public.app_user_owns_live_project(project_id)
  )
  with check (
    public.app_has_org_permission(organization_id, 'content.share')
    and public.app_user_owns_live_project(project_id)
    and (
      access <> 'write'
      or public.app_org_member_may_hold_write(organization_id, user_id)
    )
  );

drop policy if exists organization_project_access_owner_delete on public.organization_project_access;
create policy organization_project_access_owner_delete
  on public.organization_project_access for delete to app_rls
  using (
    public.app_has_org_permission(organization_id, 'content.share')
    and public.app_user_owns_live_project(project_id)
  );

commit;
