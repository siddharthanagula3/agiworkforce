-- Reversal of 0234, collapse workspace, membership status and installation back
-- into the organization row they were read out of.
--
-- What is lost: which workspaces existed beyond the primary one, whether a
-- member was invited, suspended or deprovisioned rather than active, which seat
-- they held, the account locale and personal-scope security settings, which
-- installation of which app ran on which device, and every project and device
-- policy layer. Deprovisioned memberships become indistinguishable from active
-- ones, so after this runs an offboarded member holds access again: revoke the
-- rows before reversing, not after.

begin;

-- Project and device layers have nowhere to live once the check constraint is
-- narrowed, so they go before it.
delete from public.organization_policy_overrides
 where subject_type in ('project', 'device');

drop trigger if exists delete_device_policy_overrides on public.device_installations;
drop trigger if exists delete_project_policy_overrides on public.user_projects;
drop function if exists public.delete_policy_overrides_for_scope();

alter table public.organization_policy_overrides
  drop constraint if exists organization_policy_overrides_subject_type_check;
alter table public.organization_policy_overrides
  add constraint organization_policy_overrides_subject_type_check
  check (subject_type in ('role', 'group', 'user'));

drop policy if exists device_installations_own on public.device_installations;
alter table public.device_installations disable row level security;
drop trigger if exists set_device_installations_updated_at on public.device_installations;
drop index if exists public.idx_device_installations_account;
drop table if exists public.device_installations;

drop policy if exists account_security_settings_own on public.account_security_settings;
alter table public.account_security_settings disable row level security;
drop trigger if exists set_account_security_settings_updated_at
  on public.account_security_settings;
drop table if exists public.account_security_settings;

alter table public.profiles
  drop column if exists locale;

-- 0200's definition, restored: without the status column there is no status to
-- filter on, and leaving 0234's body in place would refuse every member.
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

drop trigger if exists assert_membership_status_transition on public.organization_members;
drop function if exists public.assert_membership_status_transition();

drop index if exists public.idx_org_members_status;

alter table public.organization_members
  drop column if exists is_primary_owner;
alter table public.organization_members
  drop column if exists seat_type;
alter table public.organization_members
  drop column if exists status_changed_at;
alter table public.organization_members
  drop column if exists status;

drop trigger if exists refuse_primary_workspace_delete on public.workspaces;
drop trigger if exists create_primary_workspace on public.organizations;
drop function if exists public.refuse_primary_workspace_delete();
drop function if exists public.create_primary_workspace_for_organization();

drop policy if exists workspaces_member_read on public.workspaces;
alter table public.workspaces disable row level security;
drop trigger if exists set_workspaces_updated_at on public.workspaces;
drop index if exists public.idx_workspaces_personal_account;
drop index if exists public.idx_workspaces_organization_slug;
drop index if exists public.idx_workspaces_organization_primary;
drop table if exists public.workspaces;

delete from public.schema_migrations
 where filename = '0234_workspaces_membership_status_and_installations.sql';

commit;
