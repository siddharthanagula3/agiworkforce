-- =============================================================================
-- Migration 0248: namespaced permission keys, role concurrency, SCIM-owned
--                 group membership locked to the provisioner
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : three defects in the 0200 permission grid and the 0084 SCIM tables.
--
--          First, the permission registry mixes feature permissions with admin
--          ones and splits view from manage in only two places, so "what can
--          this role see, and what can it change" has no systematic answer.
--          `packages/contracts/types/src/enterprise/permissions.ts` now names
--          every key `feature.<area>.<capability>` or `admin.<area>.<level>`
--          with level in (view, manage); NONE is the absence of both. Renaming
--          the keys would orphan every stored grant, so the old key stays
--          valid and `organization_permission_aliases` records which canonical
--          key it means. `organization_member_permissions` resolves a grant to
--          both forms and lets manage imply view, so a policy written against
--          `policy.manage` and a role granted `admin.policy.manage` agree.
--
--          Second, `organization_roles` had no version of its own. Two
--          administrators editing two different roles collided on the
--          workspace revision, and two editing the SAME role silently
--          overwrote each other. The column below is bumped on every write and
--          the service refuses a stale one with a conflict.
--
--          Third, 0084 granted app_rls insert/update/delete on
--          `scim_group_members`, so an owner or admin session could add or
--          remove a member of an IdP-owned group. The next sync silently undid
--          it, which is the worst of both: the change looked accepted and was
--          not. Membership now belongs to the provisioner alone; the SCIM
--          service writes it through the privileged pool, which is not subject
--          to these policies.
--
-- Grants : no stored grant is rewritten. A role still carrying `audit.read`
--          resolves to `admin.audit.view` as well, and a role granted
--          `admin.audit.manage` resolves to `audit.read` too, so nothing loses
--          or gains access on apply.
--
-- Depends: 0084 (scim tables), 0200 (organization_roles,
--          organization_member_permissions, app_has_org_permission).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. The alias map. One row per legacy key, naming the canonical key it means.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_permission_aliases (
  legacy_key text primary key,
  canonical_key text not null,
  created_at timestamptz not null default now()
);

insert into public.organization_permission_aliases (legacy_key, canonical_key)
values
  ('content.read', 'feature.content.view'),
  ('content.share', 'feature.content.share'),
  ('content.govern', 'feature.content.govern'),
  ('sharing.manage', 'feature.sharing.manage'),
  ('members.manage', 'admin.members.manage'),
  ('owners.manage', 'admin.owners.manage'),
  ('roles.manage', 'admin.roles.manage'),
  ('groups.manage', 'admin.groups.manage'),
  ('policy.manage', 'admin.policy.manage'),
  ('identity.read', 'admin.identity.view'),
  ('identity.manage', 'admin.identity.manage'),
  ('directory.manage', 'admin.directory.manage'),
  ('audit.read', 'admin.audit.view'),
  ('billing.read', 'admin.billing.view'),
  ('workspace.settings', 'admin.workspace.manage'),
  ('ownership.transfer', 'admin.ownership.manage'),
  ('workspace.delete', 'admin.lifecycle.manage'),
  ('billing.contracts.manage', 'admin.contracts.manage')
on conflict (legacy_key) do update set canonical_key = excluded.canonical_key;

grant select on public.organization_permission_aliases to app_rls;

alter table public.organization_permission_aliases enable row level security;
alter table public.organization_permission_aliases force row level security;
drop policy if exists organization_permission_aliases_read
  on public.organization_permission_aliases;
create policy organization_permission_aliases_read
  on public.organization_permission_aliases for select to app_rls
  using (true);

-- ---------------------------------------------------------------------------
-- B. A role may now carry a namespaced key as well as the key it shipped with.
-- ---------------------------------------------------------------------------
alter table public.organization_roles
  drop constraint if exists organization_roles_known_permissions;

alter table public.organization_roles
  add constraint organization_roles_known_permissions check (
    permissions <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings',
      'ownership.transfer', 'workspace.delete', 'billing.contracts.manage',
      'feature.content.view', 'feature.content.share', 'feature.content.govern',
      'feature.sharing.manage',
      'admin.members.view', 'admin.members.manage',
      'admin.owners.view', 'admin.owners.manage',
      'admin.roles.view', 'admin.roles.manage',
      'admin.groups.view', 'admin.groups.manage',
      'admin.policy.view', 'admin.policy.manage',
      'admin.identity.view', 'admin.identity.manage',
      'admin.directory.view', 'admin.directory.manage',
      'admin.audit.view', 'admin.audit.manage',
      'admin.billing.view', 'admin.billing.manage',
      'admin.workspace.view', 'admin.workspace.manage',
      'admin.ownership.view', 'admin.ownership.manage',
      'admin.lifecycle.view', 'admin.lifecycle.manage',
      'admin.contracts.view', 'admin.contracts.manage'
    ]::text[]
  );

alter table public.organization_roles
  drop constraint if exists organization_roles_primary_owner_permissions;

alter table public.organization_roles
  add constraint organization_roles_primary_owner_permissions check (
    (organization_id is null and key = 'primary_owner')
    or not (permissions && array[
      'ownership.transfer', 'workspace.delete', 'billing.contracts.manage',
      'admin.ownership.manage', 'admin.lifecycle.manage', 'admin.contracts.manage'
    ]::text[])
  );

-- ---------------------------------------------------------------------------
-- C. Per-role optimistic concurrency.
-- ---------------------------------------------------------------------------
alter table public.organization_roles
  add column if not exists version integer not null default 1;

-- ---------------------------------------------------------------------------
-- D. Resolution: a grant answers in both vocabularies, and manage implies view.
-- ---------------------------------------------------------------------------
create or replace function public.organization_permission_closure(p_permissions text[])
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with given as (
    select distinct permission from unnest(coalesce(p_permissions, array[]::text[])) as permission
  ),
  canonical as (
    select coalesce(a.canonical_key, g.permission) as permission
      from given g
      left join public.organization_permission_aliases a on a.legacy_key = g.permission
  ),
  implied as (
    select permission from canonical
    union
    select regexp_replace(permission, '\.manage$', '.view')
      from canonical
     where permission like 'admin.%.manage'
  ),
  both_forms as (
    select permission from implied
    union
    select a.legacy_key from implied i join public.organization_permission_aliases a
      on a.canonical_key = i.permission
    union
    select permission from given
  )
  select coalesce(array(select distinct permission from both_forms order by permission),
                  array[]::text[]);
$$;

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
  select public.organization_permission_closure(
    coalesce(
      array(
        select distinct permission
          from held, unnest(held.permissions) as permission
      ),
      array[]::text[]
    )
  );
$$;

revoke all on function public.organization_member_permissions(uuid, text) from public;
revoke all on function public.organization_permission_closure(text[]) from public;
grant execute on function public.organization_permission_closure(text[]) to app_rls;

-- ---------------------------------------------------------------------------
-- E. SCIM-owned group membership is not editable from the admin surface.
-- ---------------------------------------------------------------------------
-- A manual edit here was accepted and then silently reverted by the next sync.
-- Reading stays, because the console shows who is in each group.
revoke insert, update, delete on public.scim_group_members from app_rls;

drop policy if exists scim_group_members_admin_access on public.scim_group_members;
create policy scim_group_members_admin_read
  on public.scim_group_members for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

commit;
