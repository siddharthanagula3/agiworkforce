-- Reversal of 0200: return to the four fixed membership roles.
--
-- WHAT THIS COSTS: every custom role, every additional role a member holds,
-- every role granted to a directory group and every delegated group manager is
-- destroyed. A viewer can again share their own artifacts and conversations
-- into the workspace, and anyone who held admin rights only through a custom
-- or group role loses them. Export the four tables first if any are in use.

begin;

create or replace function public.app_row_is_visible(row_user_id text, row_org_id uuid)
returns boolean
language sql
stable
as $$
  select (
        row_user_id = public.current_app_user_id()
        and row_org_id is not distinct from public.current_app_org_id()
      )
      or (
        row_org_id is not null
        and row_org_id = public.current_app_org_id()
        and public.current_app_org_role() in ('owner', 'admin')
      );
$$;

create or replace function public.app_org_resource_is_readable(row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_org_id is not null
     and public.app_has_org_role(
           row_org_id,
           array['owner', 'admin', 'member', 'viewer']::text[]
         );
$$;

create or replace function public.app_org_resource_is_manageable(row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_org_id is not null
     and public.app_has_org_role(row_org_id, array['owner', 'admin']::text[]);
$$;

drop policy if exists organization_shared_artifacts_owner_insert on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_insert
  on public.organization_shared_artifacts for insert to app_rls
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.published_artifacts artifact
       where artifact.id = organization_shared_artifacts.published_artifact_id
         and artifact.user_id = public.current_app_user_id()
    )
  );

drop policy if exists organization_shared_artifacts_owner_update on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_update
  on public.organization_shared_artifacts for update to app_rls
  using (
    public.app_org_resource_is_readable(organization_id)
    and (
      public.app_org_resource_is_manageable(organization_id)
      or exists (
        select 1
          from public.published_artifacts artifact
         where artifact.id = organization_shared_artifacts.published_artifact_id
           and artifact.user_id = public.current_app_user_id()
      )
    )
  )
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.published_artifacts artifact
       where artifact.id = organization_shared_artifacts.published_artifact_id
         and artifact.user_id = public.current_app_user_id()
    )
  );

drop policy if exists organization_shared_sessions_owner_insert on public.organization_shared_sessions;
create policy organization_shared_sessions_owner_insert
  on public.organization_shared_sessions for insert to app_rls
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.shared_sessions session
       where session.id = organization_shared_sessions.shared_session_id
         and session.owner_id = public.current_app_user_id()
    )
  );

drop policy if exists organization_shared_sessions_owner_update on public.organization_shared_sessions;
create policy organization_shared_sessions_owner_update
  on public.organization_shared_sessions for update to app_rls
  using (
    public.app_org_resource_is_readable(organization_id)
    and (
      public.app_org_resource_is_manageable(organization_id)
      or exists (
        select 1
          from public.shared_sessions session
         where session.id = organization_shared_sessions.shared_session_id
           and session.owner_id = public.current_app_user_id()
      )
    )
  )
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.shared_sessions session
       where session.id = organization_shared_sessions.shared_session_id
         and session.owner_id = public.current_app_user_id()
    )
  );

drop policy if exists organization_project_access_admin_write on public.organization_project_access;
create policy organization_project_access_admin_write
  on public.organization_project_access for all to app_rls
  using (public.app_org_resource_is_manageable(organization_id))
  with check (public.app_org_resource_is_manageable(organization_id));

drop policy if exists organization_admin_policies_admin_write on public.organization_admin_policies;
create policy organization_admin_policies_admin_write
  on public.organization_admin_policies for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organization_members_admin_read on public.organization_members;
create policy organization_members_admin_read
  on public.organization_members for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organization_members_admin_write on public.organization_members;
create policy organization_members_admin_write
  on public.organization_members for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (
    public.app_has_org_role(organization_id, array['owner', 'admin']::text[])
    and (
      role <> 'owner'
      or public.app_has_org_role(organization_id, array['owner']::text[])
    )
  );

drop policy if exists organization_invitations_admin_access on public.organization_invitations;
create policy organization_invitations_admin_access
  on public.organization_invitations for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
  on public.organizations for update to app_rls
  using (public.app_has_org_role(id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(id, array['owner', 'admin']::text[]));

drop policy if exists sso_connections_admin_read on public.sso_connections;
create policy sso_connections_admin_read
  on public.sso_connections for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));
drop policy if exists sso_connections_owner_insert on public.sso_connections;
create policy sso_connections_owner_insert
  on public.sso_connections for insert to app_rls
  with check (public.app_has_org_role(organization_id, array['owner']::text[]));
drop policy if exists sso_connections_owner_update on public.sso_connections;
create policy sso_connections_owner_update
  on public.sso_connections for update to app_rls
  using (public.app_has_org_role(organization_id, array['owner']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner']::text[]));
drop policy if exists sso_connections_owner_delete on public.sso_connections;
create policy sso_connections_owner_delete
  on public.sso_connections for delete to app_rls
  using (public.app_has_org_role(organization_id, array['owner']::text[]));

drop policy if exists directory_sync_connections_admin_access on public.directory_sync_connections;
create policy directory_sync_connections_admin_access
  on public.directory_sync_connections for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists scim_tokens_admin_access on public.scim_tokens;
create policy scim_tokens_admin_access
  on public.scim_tokens for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists scim_provisioned_users_admin_access on public.scim_provisioned_users;
create policy scim_provisioned_users_admin_access
  on public.scim_provisioned_users for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists scim_groups_admin_access on public.scim_groups;
create policy scim_groups_admin_access
  on public.scim_groups for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists scim_group_members_admin_access on public.scim_group_members;
create policy scim_group_members_admin_access
  on public.scim_group_members for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists directory_sync_events_admin_read on public.directory_sync_events;
create policy directory_sync_events_admin_read
  on public.directory_sync_events for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists enterprise_audit_events_admin_read on public.enterprise_audit_events;
create policy enterprise_audit_events_admin_read
  on public.enterprise_audit_events for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organization_usage_ledger_admin_read on public.organization_usage_ledger;
create policy organization_usage_ledger_admin_read
  on public.organization_usage_ledger for select to app_rls
  using (
    organization_id is not null
    and public.app_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists organization_billing_contracts_admin_read
  on public.organization_billing_contracts;
create policy organization_billing_contracts_admin_read
  on public.organization_billing_contracts for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organization_billing_invoices_admin_read
  on public.organization_billing_invoices;
create policy organization_billing_invoices_admin_read
  on public.organization_billing_invoices for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop table if exists public.organization_group_managers;
drop table if exists public.organization_group_roles;
drop table if exists public.organization_member_roles;
drop table if exists public.organization_roles;

drop function if exists public.assert_organization_group_manager_target();
drop function if exists public.assert_organization_role_grant_target();
drop function if exists public.app_org_member_may_hold_write(uuid, text);
drop function if exists public.app_is_org_group_manager(uuid, uuid);
drop function if exists public.app_org_permissions_within_caller(uuid, text[]);
drop function if exists public.app_org_role_within_caller_permissions(uuid, uuid);
drop function if exists public.app_has_org_permission(uuid, text);
drop function if exists public.organization_member_permissions(uuid, text);

delete from public.schema_migrations
 where filename = '0200_organization_permission_grid.sql';

commit;
