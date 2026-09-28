-- =============================================================================
-- Migration 0314: administrators create groups and choose their members
--
-- Why    : a group existed only when an identity provider pushed it over
--          SCIM, so a workspace without directory sync had no groups to grant
--          roles or policy exceptions to. ChatGPT Enterprise and Claude
--          Enterprise both let administrators manage groups by hand.
--
-- Shape  : public.scim_groups keeps every group, so role grants, managers
--          and policy exceptions keep working unchanged. source says who owns
--          it: 'directory' rows come from a connection and are replaced by
--          the next sync; 'workspace' rows have no connection and are edited
--          in the console. Workspace-group membership is
--          public.organization_group_members, keyed by the member's user id
--          and cascading from organization_members, so leaving the workspace
--          leaves its groups. organization_member_permissions counts both
--          kinds of membership.
--
-- Depends: 0084 (scim_groups), 0200 (organization_members key, group roles,
--          app_has_org_permission), 0272 (organization_member_permissions)
-- =============================================================================

begin;

alter table public.scim_groups
  alter column connection_id drop not null,
  add column if not exists source text not null default 'directory',
  add column if not exists created_by_user_id text;

alter table public.scim_groups
  drop constraint if exists scim_groups_source_check,
  add constraint scim_groups_source_check
    check (
      (source = 'directory' and connection_id is not null)
      or (source = 'workspace' and connection_id is null)
    );

create unique index if not exists idx_scim_groups_workspace_name
  on public.scim_groups (organization_id, lower(display_name))
  where source = 'workspace';

create table if not exists public.organization_group_members (
  organization_id uuid not null,
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  user_id text not null,
  added_by_user_id text,
  created_at timestamptz not null default now(),
  primary key (organization_id, group_id, user_id),
  constraint organization_group_members_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);

create index if not exists idx_organization_group_members_user
  on public.organization_group_members (user_id, organization_id);

create or replace function public.assert_organization_group_member_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.scim_groups g
     where g.id = new.group_id
       and g.organization_id = new.organization_id
       and g.source = 'workspace'
  ) then
    raise exception 'organization_group_not_workspace_managed' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists assert_group_member_target on public.organization_group_members;
create trigger assert_group_member_target
  before insert or update on public.organization_group_members
  for each row execute function public.assert_organization_group_member_target();

grant select on public.organization_group_members to app_rls;

alter table public.organization_group_members enable row level security;
alter table public.organization_group_members force row level security;

drop policy if exists organization_group_members_read on public.organization_group_members;
create policy organization_group_members_read
  on public.organization_group_members for select to app_rls
  using (
    user_id = public.current_app_user_id()
    or public.app_has_org_permission(organization_id, 'groups.manage')
  );

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
    union all
    select r.permissions
      from membership m
      join public.organization_group_members wm
        on wm.organization_id = p_organization_id
       and wm.user_id = p_user_id
      join public.organization_group_roles gr
        on gr.group_id = wm.group_id
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

comment on column public.scim_groups.source is
  'directory: pushed over SCIM by connection_id and replaced by the next sync. workspace: created in the console, no connection, members in organization_group_members.';
comment on table public.organization_group_members is
  'Members of a workspace-managed group, added by groups.manage. Cascades from organization_members, so leaving the workspace leaves its groups.';

commit;
