-- =============================================================================
-- Migration 0200: organization permission grid, custom roles, group roles,
-- delegated group managers, and a read-only viewer.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : `organization_members.role` holds one of four values and every RLS
--          policy asked `app_has_org_role(org, array['owner', 'admin'])`. That
--          answers "owner or admin versus everyone else" and nothing more: no
--          custom role, no second role, no role granted by a directory group,
--          and a `viewer` that no statement ever distinguished from `member`.
--          An administrator who set someone to Viewer believed they had
--          restricted them, and had not.
--
-- Model  : A role is a named set of PERMISSIONS. Policies ask for a permission,
--          never for a role name, so a custom role an organization defines is
--          honoured by the same policies as a built-in one.
--            * `organization_roles`         built-in rows (organization_id
--                                           NULL) and per-organization custom
--                                           roles
--            * `organization_member_roles`  additional roles held by a member
--            * `organization_group_roles`   roles every member of a directory
--                                           (SCIM) group holds
--            * `organization_group_managers` members delegated to manage the
--                                           roles of one group
--          A member's permissions are the union of their membership role's
--          built-in permissions, their additional roles, and the roles of every
--          directory group they belong to (`organization_member_permissions`).
--
-- Roles  : `organization_members.role = 'owner'` is the PRIMARY OWNER. There is
--          exactly one (0085's unique index), and only the Primary Owner can
--          transfer ownership, delete the workspace, and manage the workspace's
--          billing contract (`ownership.transfer`, `workspace.delete`,
--          `billing.contracts.manage`). No other role, built-in or custom, can
--          carry those three permissions: the check constraint below refuses
--          them on every row except the built-in `primary_owner`.
--          The built-in OWNER role is distinct from the Primary Owner. It is
--          held as an additional role, carries every other permission, and
--          there may be several.
--          VIEWER is read-only: `content.read` and nothing else. A viewer opens
--          what the workspace shares; they cannot share a project, artifact or
--          conversation into it, cannot hold write access on a shared project,
--          and cannot change workspace settings.
--
-- Escalate: A role grant is refused unless every permission of the role is
--          already held by the person granting it, enforced in the WITH CHECK
--          of both grant tables, so holding `roles.manage` is not a path to
--          `owners.manage`.
--
-- Rewires: `app_org_resource_is_readable`, `app_org_resource_is_manageable`
--          and `app_row_is_visible` keep their signatures and change their
--          bodies, so every policy that already calls them follows. The
--          policies that hard-coded a role array are re-stated below with the
--          permission that names what they protect.
--
-- Depends: 0015, 0037 (app_rls, current_app_user_id), 0073/0110
--          (app_row_is_visible), 0076 (app_has_org_role, control-plane
--          tables), 0084 (scim tables), 0085 (members, invitations,
--          organizations update), 0086 (sharing predicates), 0163 (billing
--          contracts), 0185/0186 (share grant policies).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. Roles.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  permissions text[] not null default array[]::text[],
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_roles_known_permissions check (
    permissions <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings',
      'ownership.transfer', 'workspace.delete', 'billing.contracts.manage'
    ]::text[]
  ),
  constraint organization_roles_primary_owner_permissions check (
    (organization_id is null and key = 'primary_owner')
    or not (permissions && array[
      'ownership.transfer', 'workspace.delete', 'billing.contracts.manage'
    ]::text[])
  ),
  constraint organization_roles_custom_key_not_built_in check (
    organization_id is null
    or key <> all (array['primary_owner', 'owner', 'admin', 'member', 'viewer']::text[])
  )
);

create unique index if not exists idx_organization_roles_built_in_key
  on public.organization_roles (key)
  where organization_id is null;
create unique index if not exists idx_organization_roles_org_key
  on public.organization_roles (organization_id, key)
  where organization_id is not null;

drop trigger if exists set_organization_roles_updated_at on public.organization_roles;
create trigger set_organization_roles_updated_at
  before update on public.organization_roles
  for each row execute function public.set_row_updated_at();

insert into public.organization_roles (organization_id, key, name, description, permissions)
values
  (null, 'primary_owner', 'Primary Owner',
   'The one person who can transfer ownership, delete the workspace and manage its billing contract.',
   array[
     'content.read', 'content.share', 'content.govern', 'sharing.manage',
     'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
     'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
     'audit.read', 'billing.read', 'workspace.settings',
     'ownership.transfer', 'workspace.delete', 'billing.contracts.manage'
   ]::text[]),
  (null, 'owner', 'Owner',
   'Everything an admin can do, plus single sign-on, directory group roles and other owners.',
   array[
     'content.read', 'content.share', 'content.govern', 'sharing.manage',
     'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
     'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
     'audit.read', 'billing.read', 'workspace.settings'
   ]::text[]),
  (null, 'admin', 'Admin',
   'Manages members, roles, policy, directory sync and what is shared.',
   array[
     'content.read', 'content.share', 'content.govern', 'sharing.manage',
     'members.manage', 'roles.manage', 'policy.manage', 'identity.read',
     'directory.manage', 'audit.read', 'billing.read', 'workspace.settings'
   ]::text[]),
  (null, 'member', 'Member',
   'Opens what the workspace shares and shares their own work into it.',
   array['content.read', 'content.share']::text[]),
  (null, 'viewer', 'Viewer',
   'Read-only: opens what the workspace shares, and cannot share, edit or change settings.',
   array['content.read']::text[])
on conflict (key) where organization_id is null do update
   set name = excluded.name,
       description = excluded.description,
       permissions = excluded.permissions;

-- ---------------------------------------------------------------------------
-- B. Grants of roles to members, to directory groups, and group managers.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_member_roles (
  organization_id uuid not null,
  user_id text not null,
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  granted_by_user_id text,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role_id),
  constraint organization_member_roles_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade
);

create index if not exists idx_organization_member_roles_role
  on public.organization_member_roles (role_id);

create table if not exists public.organization_group_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  granted_by_user_id text,
  created_at timestamptz not null default now(),
  primary key (organization_id, group_id, role_id)
);

create index if not exists idx_organization_group_roles_group
  on public.organization_group_roles (group_id);
create index if not exists idx_organization_group_roles_role
  on public.organization_group_roles (role_id);

create table if not exists public.organization_group_managers (
  organization_id uuid not null,
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  user_id text not null,
  granted_by_user_id text,
  created_at timestamptz not null default now(),
  primary key (organization_id, group_id, user_id),
  constraint organization_group_managers_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade
);

create index if not exists idx_organization_group_managers_user
  on public.organization_group_managers (user_id, organization_id);

-- A grant may only name a role that belongs to the same organization or is an
-- assignable built-in, and a group grant may only name that organization's
-- group. Checked by trigger because both are cross-table facts.
create or replace function public.assert_organization_role_grant_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role public.organization_roles%rowtype;
begin
  select * into target_role from public.organization_roles where id = new.role_id;
  if not found then
    raise exception 'organization_role_not_found' using errcode = '23503';
  end if;
  if target_role.organization_id is null then
    if target_role.key = 'primary_owner' then
      raise exception 'primary_owner_not_grantable' using errcode = '23514';
    end if;
  elsif target_role.organization_id <> new.organization_id then
    raise exception 'organization_role_foreign' using errcode = '23514';
  end if;
  if tg_table_name = 'organization_group_roles' then
    if not exists (
      select 1 from public.scim_groups g
       where g.id = new.group_id and g.organization_id = new.organization_id
    ) then
      raise exception 'organization_group_foreign' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assert_member_role_grant_target on public.organization_member_roles;
create trigger assert_member_role_grant_target
  before insert or update on public.organization_member_roles
  for each row execute function public.assert_organization_role_grant_target();

drop trigger if exists assert_group_role_grant_target on public.organization_group_roles;
create trigger assert_group_role_grant_target
  before insert or update on public.organization_group_roles
  for each row execute function public.assert_organization_role_grant_target();

create or replace function public.assert_organization_group_manager_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.scim_groups g
     where g.id = new.group_id and g.organization_id = new.organization_id
  ) then
    raise exception 'organization_group_foreign' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists assert_group_manager_target on public.organization_group_managers;
create trigger assert_group_manager_target
  before insert or update on public.organization_group_managers
  for each row execute function public.assert_organization_group_manager_target();

-- ---------------------------------------------------------------------------
-- C. The permission answer.
--
-- `organization_member_permissions` takes an explicit user and is NOT granted
-- to app_rls, so a session cannot enumerate another person's permissions. The
-- application's privileged pool calls it. `app_has_org_permission` is the
-- policy-facing form and always asks about the authenticated subject.
-- ---------------------------------------------------------------------------
create or replace function public.organization_member_permissions(
  p_organization_id uuid,
  p_user_id text
)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with membership as (
    select m.role
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = p_user_id
  ),
  held as (
    select r.permissions
      from membership m
      join public.organization_roles r
        on r.organization_id is null
       and r.key = case m.role when 'owner' then 'primary_owner' else m.role end
    union all
    select r.permissions
      from membership m
      join public.organization_member_roles mr
        on mr.organization_id = p_organization_id
       and mr.user_id = p_user_id
      join public.organization_roles r on r.id = mr.role_id
    union all
    select r.permissions
      from membership m
      join public.scim_provisioned_users su
        on su.organization_id = p_organization_id
       and su.linked_user_id = p_user_id
       and su.active
      join public.scim_group_members gm
        on gm.scim_user_id = su.id
       and gm.organization_id = p_organization_id
      join public.organization_group_roles gr
        on gr.group_id = gm.group_id
       and gr.organization_id = p_organization_id
      join public.organization_roles r on r.id = gr.role_id
  )
  select coalesce(
    array(
      select distinct permission
        from held, unnest(held.permissions) as permission
       order by permission
    ),
    array[]::text[]
  );
$$;

revoke all on function public.organization_member_permissions(uuid, text) from public;

create or replace function public.app_has_org_permission(
  target_organization_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_organization_id is not null
     and public.current_app_user_id() is not null
     and required_permission = any (
       public.organization_member_permissions(
         target_organization_id,
         public.current_app_user_id()
       )
     );
$$;

revoke all on function public.app_has_org_permission(uuid, text) from public;
grant execute on function public.app_has_org_permission(uuid, text) to app_rls;

-- Anti-escalation: the caller already holds every permission the role carries.
create or replace function public.app_org_role_within_caller_permissions(
  target_organization_id uuid,
  target_role_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.organization_roles r
     where r.id = target_role_id
       and r.permissions <@ public.organization_member_permissions(
             target_organization_id,
             public.current_app_user_id()
           )
  );
$$;

revoke all on function public.app_org_role_within_caller_permissions(uuid, uuid) from public;
grant execute on function public.app_org_role_within_caller_permissions(uuid, uuid) to app_rls;

create or replace function public.app_org_permissions_within_caller(
  target_organization_id uuid,
  requested_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select requested_permissions <@ public.organization_member_permissions(
    target_organization_id,
    public.current_app_user_id()
  );
$$;

revoke all on function public.app_org_permissions_within_caller(uuid, text[]) from public;
grant execute on function public.app_org_permissions_within_caller(uuid, text[]) to app_rls;

create or replace function public.app_is_org_group_manager(
  target_organization_id uuid,
  target_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.organization_group_managers gm
      join public.organization_members m
        on m.organization_id = gm.organization_id
       and m.user_id = gm.user_id
     where gm.organization_id = target_organization_id
       and gm.group_id = target_group_id
       and gm.user_id = public.current_app_user_id()
  );
$$;

revoke all on function public.app_is_org_group_manager(uuid, uuid) from public;
grant execute on function public.app_is_org_group_manager(uuid, uuid) to app_rls;

-- A write grant on a shared project only lands on someone who may share.
create or replace function public.app_org_member_may_hold_write(
  target_organization_id uuid,
  target_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.app_has_org_permission(target_organization_id, 'content.read')
     and 'content.share' = any (
       public.organization_member_permissions(target_organization_id, target_user_id)
     );
$$;

revoke all on function public.app_org_member_may_hold_write(uuid, text) from public;
grant execute on function public.app_org_member_may_hold_write(uuid, text) to app_rls;

-- ---------------------------------------------------------------------------
-- D. Existing predicates, same signatures, permission bodies.
-- ---------------------------------------------------------------------------
create or replace function public.app_org_resource_is_readable(row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_org_id is not null
     and public.app_has_org_permission(row_org_id, 'content.read');
$$;

create or replace function public.app_org_resource_is_manageable(row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_org_id is not null
     and public.app_has_org_permission(row_org_id, 'sharing.manage');
$$;

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
        and public.app_has_org_permission(row_org_id, 'content.govern')
      );
$$;

-- ---------------------------------------------------------------------------
-- E. Sharing into the workspace requires `content.share`. Reading a share and
-- withdrawing one's own share are unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists organization_shared_artifacts_owner_insert on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_insert
  on public.organization_shared_artifacts for insert to app_rls
  with check (
    public.app_has_org_permission(organization_id, 'content.share')
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
    public.app_has_org_permission(organization_id, 'content.share')
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
    public.app_has_org_permission(organization_id, 'content.share')
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
    public.app_has_org_permission(organization_id, 'content.share')
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
  with check (
    public.app_org_resource_is_manageable(organization_id)
    and (
      access <> 'write'
      or public.app_org_member_may_hold_write(organization_id, user_id)
    )
  );

-- ---------------------------------------------------------------------------
-- F. Control-plane policies that named a role array, re-stated by permission.
-- ---------------------------------------------------------------------------
drop policy if exists organization_admin_policies_admin_write on public.organization_admin_policies;
create policy organization_admin_policies_admin_write
  on public.organization_admin_policies for all to app_rls
  using (public.app_has_org_permission(organization_id, 'policy.manage'))
  with check (public.app_has_org_permission(organization_id, 'policy.manage'));

drop policy if exists organization_members_admin_read on public.organization_members;
create policy organization_members_admin_read
  on public.organization_members for select to app_rls
  using (public.app_has_org_permission(organization_id, 'members.manage'));

drop policy if exists organization_members_admin_write on public.organization_members;
create policy organization_members_admin_write
  on public.organization_members for all to app_rls
  using (public.app_has_org_permission(organization_id, 'members.manage'))
  with check (
    public.app_has_org_permission(organization_id, 'members.manage')
    and (
      role <> 'owner'
      or public.app_has_org_permission(organization_id, 'ownership.transfer')
    )
  );

drop policy if exists organization_invitations_admin_access on public.organization_invitations;
create policy organization_invitations_admin_access
  on public.organization_invitations for all to app_rls
  using (public.app_has_org_permission(organization_id, 'members.manage'))
  with check (public.app_has_org_permission(organization_id, 'members.manage'));

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
  on public.organizations for update to app_rls
  using (public.app_has_org_permission(id, 'workspace.settings'))
  with check (public.app_has_org_permission(id, 'workspace.settings'));

drop policy if exists sso_connections_admin_read on public.sso_connections;
create policy sso_connections_admin_read
  on public.sso_connections for select to app_rls
  using (public.app_has_org_permission(organization_id, 'identity.read'));
drop policy if exists sso_connections_owner_insert on public.sso_connections;
create policy sso_connections_owner_insert
  on public.sso_connections for insert to app_rls
  with check (public.app_has_org_permission(organization_id, 'identity.manage'));
drop policy if exists sso_connections_owner_update on public.sso_connections;
create policy sso_connections_owner_update
  on public.sso_connections for update to app_rls
  using (public.app_has_org_permission(organization_id, 'identity.manage'))
  with check (public.app_has_org_permission(organization_id, 'identity.manage'));
drop policy if exists sso_connections_owner_delete on public.sso_connections;
create policy sso_connections_owner_delete
  on public.sso_connections for delete to app_rls
  using (public.app_has_org_permission(organization_id, 'identity.manage'));

drop policy if exists directory_sync_connections_admin_access on public.directory_sync_connections;
create policy directory_sync_connections_admin_access
  on public.directory_sync_connections for all to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'))
  with check (public.app_has_org_permission(organization_id, 'directory.manage'));

drop policy if exists scim_tokens_admin_access on public.scim_tokens;
create policy scim_tokens_admin_access
  on public.scim_tokens for all to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'))
  with check (public.app_has_org_permission(organization_id, 'directory.manage'));

drop policy if exists scim_provisioned_users_admin_access on public.scim_provisioned_users;
create policy scim_provisioned_users_admin_access
  on public.scim_provisioned_users for all to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'))
  with check (public.app_has_org_permission(organization_id, 'directory.manage'));

drop policy if exists scim_groups_admin_access on public.scim_groups;
create policy scim_groups_admin_access
  on public.scim_groups for all to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'))
  with check (public.app_has_org_permission(organization_id, 'directory.manage'));

drop policy if exists scim_group_members_admin_access on public.scim_group_members;
create policy scim_group_members_admin_access
  on public.scim_group_members for all to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'))
  with check (public.app_has_org_permission(organization_id, 'directory.manage'));

drop policy if exists directory_sync_events_admin_read on public.directory_sync_events;
create policy directory_sync_events_admin_read
  on public.directory_sync_events for select to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'));

drop policy if exists enterprise_audit_events_admin_read on public.enterprise_audit_events;
create policy enterprise_audit_events_admin_read
  on public.enterprise_audit_events for select to app_rls
  using (public.app_has_org_permission(organization_id, 'audit.read'));

drop policy if exists organization_usage_ledger_admin_read on public.organization_usage_ledger;
create policy organization_usage_ledger_admin_read
  on public.organization_usage_ledger for select to app_rls
  using (
    organization_id is not null
    and public.app_has_org_permission(organization_id, 'audit.read')
  );

drop policy if exists organization_billing_contracts_admin_read
  on public.organization_billing_contracts;
create policy organization_billing_contracts_admin_read
  on public.organization_billing_contracts for select
  using (public.app_has_org_permission(organization_id, 'billing.read'));

drop policy if exists organization_billing_invoices_admin_read
  on public.organization_billing_invoices;
create policy organization_billing_invoices_admin_read
  on public.organization_billing_invoices for select
  using (public.app_has_org_permission(organization_id, 'billing.read'));

-- ---------------------------------------------------------------------------
-- G. Row level security on the new tables.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.organization_roles,
  public.organization_member_roles,
  public.organization_group_roles,
  public.organization_group_managers
to app_rls;

alter table public.organization_roles enable row level security;
alter table public.organization_roles force row level security;

drop policy if exists organization_roles_read on public.organization_roles;
create policy organization_roles_read
  on public.organization_roles for select to app_rls
  using (
    organization_id is null
    or public.app_has_org_permission(organization_id, 'content.read')
  );

drop policy if exists organization_roles_insert on public.organization_roles;
create policy organization_roles_insert
  on public.organization_roles for insert to app_rls
  with check (
    organization_id is not null
    and public.app_has_org_permission(organization_id, 'roles.manage')
    and public.app_org_permissions_within_caller(organization_id, permissions)
  );

drop policy if exists organization_roles_update on public.organization_roles;
create policy organization_roles_update
  on public.organization_roles for update to app_rls
  using (
    organization_id is not null
    and public.app_has_org_permission(organization_id, 'roles.manage')
  )
  with check (
    organization_id is not null
    and public.app_has_org_permission(organization_id, 'roles.manage')
    and public.app_org_permissions_within_caller(organization_id, permissions)
  );

drop policy if exists organization_roles_delete on public.organization_roles;
create policy organization_roles_delete
  on public.organization_roles for delete to app_rls
  using (
    organization_id is not null
    and public.app_has_org_permission(organization_id, 'roles.manage')
  );

alter table public.organization_member_roles enable row level security;
alter table public.organization_member_roles force row level security;

drop policy if exists organization_member_roles_read on public.organization_member_roles;
create policy organization_member_roles_read
  on public.organization_member_roles for select to app_rls
  using (
    user_id = public.current_app_user_id()
    or public.app_has_org_permission(organization_id, 'roles.manage')
  );

drop policy if exists organization_member_roles_insert on public.organization_member_roles;
create policy organization_member_roles_insert
  on public.organization_member_roles for insert to app_rls
  with check (
    public.app_has_org_permission(organization_id, 'roles.manage')
    and public.app_org_role_within_caller_permissions(organization_id, role_id)
  );

drop policy if exists organization_member_roles_delete on public.organization_member_roles;
create policy organization_member_roles_delete
  on public.organization_member_roles for delete to app_rls
  using (
    public.app_has_org_permission(organization_id, 'roles.manage')
    and public.app_org_role_within_caller_permissions(organization_id, role_id)
  );

alter table public.organization_group_roles enable row level security;
alter table public.organization_group_roles force row level security;

drop policy if exists organization_group_roles_read on public.organization_group_roles;
create policy organization_group_roles_read
  on public.organization_group_roles for select to app_rls
  using (
    public.app_has_org_permission(organization_id, 'groups.manage')
    or public.app_has_org_permission(organization_id, 'roles.manage')
    or public.app_is_org_group_manager(organization_id, group_id)
  );

drop policy if exists organization_group_roles_insert on public.organization_group_roles;
create policy organization_group_roles_insert
  on public.organization_group_roles for insert to app_rls
  with check (
    (
      public.app_has_org_permission(organization_id, 'groups.manage')
      or public.app_is_org_group_manager(organization_id, group_id)
    )
    and public.app_org_role_within_caller_permissions(organization_id, role_id)
  );

drop policy if exists organization_group_roles_delete on public.organization_group_roles;
create policy organization_group_roles_delete
  on public.organization_group_roles for delete to app_rls
  using (
    (
      public.app_has_org_permission(organization_id, 'groups.manage')
      or public.app_is_org_group_manager(organization_id, group_id)
    )
    and public.app_org_role_within_caller_permissions(organization_id, role_id)
  );

alter table public.organization_group_managers enable row level security;
alter table public.organization_group_managers force row level security;

drop policy if exists organization_group_managers_read on public.organization_group_managers;
create policy organization_group_managers_read
  on public.organization_group_managers for select to app_rls
  using (
    user_id = public.current_app_user_id()
    or public.app_has_org_permission(organization_id, 'groups.manage')
  );

drop policy if exists organization_group_managers_write on public.organization_group_managers;
create policy organization_group_managers_write
  on public.organization_group_managers for all to app_rls
  using (public.app_has_org_permission(organization_id, 'groups.manage'))
  with check (public.app_has_org_permission(organization_id, 'groups.manage'));

comment on table public.organization_roles is
  'Permission sets. organization_id NULL rows are the built-in roles; primary_owner is the membership role owner and is never granted. Custom roles cannot carry ownership.transfer, workspace.delete or billing.contracts.manage.';
comment on table public.organization_member_roles is
  'Additional roles a member holds on top of organization_members.role. Granting requires roles.manage and every permission of the role.';
comment on table public.organization_group_roles is
  'Roles held by every active member of a directory group. Granted by groups.manage or a delegated manager of that group, within the granter''s own permissions.';
comment on table public.organization_group_managers is
  'Members delegated to manage the roles granted to one directory group.';

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. Existing members keep what they had:
-- --    SELECT m.role, public.organization_member_permissions(m.organization_id, m.user_id)
-- --      FROM public.organization_members m LIMIT 20;
-- --    EXPECT: owner -> 18 permissions, admin -> 12, member -> 2, viewer -> 1.
--
-- -- 2. A viewer cannot share into the workspace:
-- --    SET ROLE app_rls; SET request.jwt.claim.sub = '<a viewer who owns a share>';
-- --    INSERT INTO public.organization_shared_sessions (...);
-- --    EXPECT: ERROR new row violates row-level security policy
--
-- -- 3. No custom role can carry a Primary Owner permission:
-- --    INSERT INTO public.organization_roles (organization_id, key, name, permissions)
-- --    VALUES ('<org>', 'x_role', 'X', array['workspace.delete']);
-- --    EXPECT: ERROR violates check constraint organization_roles_primary_owner_permissions
-- =============================================================================
