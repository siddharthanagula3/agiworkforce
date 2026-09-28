-- Reversal of 0314 : groups exist only when directory sync pushes them.
--
-- WHAT THIS COSTS: every group an administrator created in the console is
-- deleted with its members, role grants, managers and policy exceptions'
-- subject (the exceptions themselves remain and match nobody). Directory
-- groups are untouched.

begin;

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
       and m.status = 'active'
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

drop policy if exists organization_group_members_read on public.organization_group_members;
drop trigger if exists assert_group_member_target on public.organization_group_members;
drop function if exists public.assert_organization_group_member_target();
drop index if exists public.idx_organization_group_members_user;
alter table if exists public.organization_group_members no force row level security;
alter table if exists public.organization_group_members disable row level security;
drop table if exists public.organization_group_members;

delete from public.scim_groups where source = 'workspace';

drop index if exists public.idx_scim_groups_workspace_name;

alter table public.scim_groups
  drop constraint if exists scim_groups_source_check,
  drop column if exists created_by_user_id,
  drop column if exists source,
  alter column connection_id set not null;

delete from public.schema_migrations
 where filename = '0314_workspace_managed_groups.sql';

commit;
