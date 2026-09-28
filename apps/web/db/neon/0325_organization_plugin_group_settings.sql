-- =============================================================================
-- Migration 0325: a workspace sets its plugins per group
--
-- Why    : a workspace could approve or block plugins but not decide who
--          gets one. Claude lets an owner set each plugin to required,
--          installed by default, available or not available for the whole
--          workspace, and override that for a group; a member in several
--          groups gets the most permissive of their groups' settings, in the
--          order required, installed by default, available, not available.
--
-- Shape  : organization_plugin_group_settings is one override per plugin and
--          group, a directory group or a managed one (0314). The group
--          setting replaces the workspace-wide one for its members.
--          organization_plugin_member_preferences resolves what applies to
--          one member for every published plugin of a workspace: their
--          groups' most permissive override, else the workspace setting. It
--          runs as its owner because a member cannot read directory group
--          membership, and it answers only for the account the request is
--          signed in as.
--
-- Depends: 0015 (organizations, organization_members), 0084 (scim_groups,
--          scim_provisioned_users, scim_group_members), 0076
--          (set_row_updated_at), 0278 (assign_cloud_sync_version), 0314
--          (organization_group_members), 0324 (organization_plugins)
-- =============================================================================

begin;

create table if not exists public.organization_plugin_group_settings (
  plugin_id uuid not null references public.organization_plugins(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  install_preference text not null check (
    install_preference in ('required', 'installed_by_default', 'available', 'not_available')
  ),
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  primary key (plugin_id, group_id)
);

create index if not exists organization_plugin_group_settings_org_idx
  on public.organization_plugin_group_settings (organization_id, group_id);

drop trigger if exists set_organization_plugin_group_settings_updated_at
  on public.organization_plugin_group_settings;
create trigger set_organization_plugin_group_settings_updated_at
  before update on public.organization_plugin_group_settings
  for each row execute function public.set_row_updated_at();

drop trigger if exists organization_plugin_group_settings_assign_version
  on public.organization_plugin_group_settings;
create trigger organization_plugin_group_settings_assign_version
  before insert or update on public.organization_plugin_group_settings
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.organization_plugin_group_settings from app_rls;

alter table public.organization_plugin_group_settings enable row level security;
alter table public.organization_plugin_group_settings force row level security;

create or replace function public.organization_plugin_member_preferences(
  p_organization_id uuid,
  p_user_id text
)
returns table (plugin_id uuid, install_preference text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with member as (
    select m.user_id
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = p_user_id
       and m.status = 'active'
       and (
         nullif(public.current_app_user_id(), '') is null
         or public.current_app_user_id() = p_user_id
       )
  ),
  member_groups as (
    select gm.group_id
      from member
      join public.scim_provisioned_users su
        on su.organization_id = p_organization_id
       and su.linked_user_id = member.user_id
       and su.active
      join public.scim_group_members gm
        on gm.scim_user_id = su.id
       and gm.organization_id = p_organization_id
    union
    select wm.group_id
      from member
      join public.organization_group_members wm
        on wm.organization_id = p_organization_id
       and wm.user_id = member.user_id
  ),
  ranked as (
    select p.id,
           coalesce(
             (select max(array_position(
                       array['not_available', 'available', 'installed_by_default', 'required'],
                       s.install_preference))
                from public.organization_plugin_group_settings s
                join member_groups g on g.group_id = s.group_id
               where s.plugin_id = p.id
                 and s.organization_id = p_organization_id),
             array_position(
               array['not_available', 'available', 'installed_by_default', 'required'],
               p.install_preference)
           ) as rank
      from public.organization_plugins p
     where p.organization_id = p_organization_id
       and p.status = 'published'
       and exists (select 1 from member)
  )
  select ranked.id,
         (array['not_available', 'available', 'installed_by_default', 'required'])[ranked.rank]
    from ranked;
$$;

revoke all on function public.organization_plugin_member_preferences(uuid, text) from public;
grant execute on function public.organization_plugin_member_preferences(uuid, text) to app_rls;

comment on table public.organization_plugin_group_settings is
  'A group override of a workspace plugin''s install preference. It replaces the workspace-wide setting for the group''s members; across several groups the most permissive applies.';
comment on function public.organization_plugin_member_preferences(uuid, text) is
  'The install preference that applies to one member for each published plugin of a workspace: the most permissive of their groups'' overrides, else the workspace setting. Answers only for the signed-in account on the member connection.';

commit;
