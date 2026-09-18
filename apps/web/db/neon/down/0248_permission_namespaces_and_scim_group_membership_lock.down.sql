-- Reversal of 0248, drop the permission namespace alias layer, the per-role
-- version, and the SCIM group membership lock.
--
-- COST, read this before running it: any role granted a namespaced key
-- (`feature.*` or `admin.*`) fails the restored check constraint, so this
-- rewrites those grants back to the legacy key first and DROPS a namespaced key
-- that has no legacy equivalent, for example `admin.audit.manage` and every
-- `admin.*.view` that 0200 never had. A role whose only permissions were such
-- keys is left with none. Restoring the old write policy also lets an owner or
-- admin session edit SCIM-owned group membership again, which the next
-- directory sync silently reverts.

begin;

update public.organization_roles r
   set permissions = coalesce(
         array(
           select distinct coalesce(a.legacy_key, p)
             from unnest(r.permissions) as p
             left join public.organization_permission_aliases a on a.canonical_key = p
            where a.legacy_key is not null
               or p not like 'feature.%' and p not like 'admin.%'
            order by 1
         ),
         array[]::text[]
       )
 where r.permissions && array(
         select canonical_key from public.organization_permission_aliases
       )
    or exists (
         select 1 from unnest(r.permissions) as p
          where p like 'feature.%' or p like 'admin.%'
       );

alter table public.organization_roles
  drop constraint if exists organization_roles_known_permissions;

alter table public.organization_roles
  add constraint organization_roles_known_permissions check (
    permissions <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings',
      'ownership.transfer', 'workspace.delete', 'billing.contracts.manage'
    ]::text[]
  );

alter table public.organization_roles
  drop constraint if exists organization_roles_primary_owner_permissions;

alter table public.organization_roles
  add constraint organization_roles_primary_owner_permissions check (
    (organization_id is null and key = 'primary_owner')
    or not (permissions && array[
      'ownership.transfer', 'workspace.delete', 'billing.contracts.manage'
    ]::text[])
  );

alter table public.organization_roles drop column if exists version;

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

drop function if exists public.organization_permission_closure(text[]);

drop table if exists public.organization_permission_aliases;

grant insert, update, delete on public.scim_group_members to app_rls;

drop policy if exists scim_group_members_admin_read on public.scim_group_members;
create policy scim_group_members_admin_access
  on public.scim_group_members for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

delete from public.schema_migrations
 where filename = '0248_permission_namespaces_and_scim_group_membership_lock.sql';

commit;
