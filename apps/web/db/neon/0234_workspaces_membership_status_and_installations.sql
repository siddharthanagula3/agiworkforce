-- =============================================================================
-- Migration 0234: the workspace object, membership status, the Primary Owner
-- flag, account locale and security settings, installations, and the project
-- and device policy scopes.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Five words were used for three things. `organizations` was the
--          tenant AND the container content lives in AND the thing a settings
--          page called a "workspace"; `organization_members` had no status, so
--          an invited, a suspended and an active member were all the same row;
--          "device", "installation" and "session" were one concept, so the
--          desktop app and the CLI on one laptop could not be told apart; and
--          a personal account had no security settings of its own.
--
-- Shape  : `public.workspaces` is the container. Every organization gets
--          exactly one PRIMARY workspace, which is what every existing
--          `organization_id` column already points at, so nothing needs
--          re-scoping and no existing query changes meaning. A personal
--          workspace belongs to an account and to no organization. A tenant
--          may later hold several workspaces; the primary one is the default
--          and cannot be removed while the organization exists.
--
--          `organization_members` gains `status` (invited → active →
--          suspended → deprovisioned, the last terminal),
--          `status_changed_at`, `seat_type`, and `is_primary_owner` as a
--          GENERATED column over `role`. Generated, not stored separately,
--          because 0085 already guarantees one `role = 'owner'` per
--          organization and a second hand-maintained column would be free to
--          disagree with it.
--
--          `device_installations` separates one copy of one of our apps on a
--          machine from the machine itself and from a signed-in period of use.
--
--          `organization_policy_overrides.subject_type` gains 'project' and
--          'device', the two settings scopes 1.16 names that had nowhere to
--          live. Resolution order becomes workspace, role, group, project,
--          device, user, and every layer may only narrow
--          (`resolveWorkspaceControls` in packages/contracts/types).
--
-- Empty  : Existing rows get `status = 'active'` and `seat_type = 'full'`,
--          which is what the presence of the row already meant, and one
--          primary workspace per existing organization. No access changes.
--
-- Depends: 0002 (profiles), 0006 (user_projects), 0013 (desktop_devices),
--          0015 (organizations, organization_members), 0037 (app_rls,
--          current_app_user_id), 0085 (one owner per organization), 0200
--          (app_has_org_permission), 0201 (organization_policy_overrides)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. The workspace object.
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind = any (array['personal', 'organization'])),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_account_id text,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  is_primary boolean not null default false,
  region text check (region is null or char_length(region) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_scope_exclusive check (
    (kind = 'organization' and organization_id is not null and owner_account_id is null)
    or (kind = 'personal' and organization_id is null and owner_account_id is not null)
  ),
  constraint workspaces_primary_is_organization check (
    not is_primary or kind = 'organization'
  )
);

create unique index if not exists idx_workspaces_organization_primary
  on public.workspaces (organization_id)
  where is_primary;
create unique index if not exists idx_workspaces_organization_slug
  on public.workspaces (organization_id, slug)
  where organization_id is not null;
create unique index if not exists idx_workspaces_personal_account
  on public.workspaces (owner_account_id)
  where kind = 'personal';

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_row_updated_at();

-- Every organization that exists today is its own primary workspace. This is
-- what `organization_id` on every other table has always meant, written down.
insert into public.workspaces (kind, organization_id, name, slug, is_primary)
select 'organization', o.id, o.name, o.slug, true
  from public.organizations o
 where not exists (
   select 1 from public.workspaces w where w.organization_id = o.id and w.is_primary
 );

create or replace function public.create_primary_workspace_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.workspaces (kind, organization_id, name, slug, is_primary)
  values ('organization', new.id, new.name, new.slug, true)
  on conflict do nothing;
  return null;
end;
$$;

drop trigger if exists create_primary_workspace on public.organizations;
create trigger create_primary_workspace
  after insert on public.organizations
  for each row execute function public.create_primary_workspace_for_organization();

-- The primary workspace is not separately deletable: it exists exactly as long
-- as its organization does.
create or replace function public.refuse_primary_workspace_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_primary and exists (select 1 from public.organizations where id = old.organization_id)
  then
    raise exception 'primary_workspace_not_deletable' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists refuse_primary_workspace_delete on public.workspaces;
create trigger refuse_primary_workspace_delete
  before delete on public.workspaces
  for each row execute function public.refuse_primary_workspace_delete();

-- ---------------------------------------------------------------------------
-- B. Membership status, seat type and the Primary Owner flag.
-- ---------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists status text not null default 'active'
    check (status = any (array['invited', 'active', 'suspended', 'deprovisioned'])),
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists seat_type text not null default 'full'
    check (seat_type = any (array['full', 'limited', 'guest']));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'organization_members'
       and column_name = 'is_primary_owner'
  ) then
    alter table public.organization_members
      add column is_primary_owner boolean
      generated always as (role = 'owner') stored;
  end if;
end $$;

create index if not exists idx_org_members_status
  on public.organization_members (organization_id, status);

-- Deprovisioned is terminal: re-admitting somebody is a new invitation, never a
-- column flipped back.
create or replace function public.assert_membership_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'deprovisioned' then
      raise exception 'membership_deprovisioned_is_terminal' using errcode = '23514';
    end if;
    if old.status = 'invited' and new.status not in ('active', 'deprovisioned') then
      raise exception 'membership_invalid_transition' using errcode = '23514';
    end if;
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists assert_membership_status_transition on public.organization_members;
create trigger assert_membership_status_transition
  before update on public.organization_members
  for each row execute function public.assert_membership_status_transition();

-- Only an active membership carries access. `organization_member_permissions`
-- is the one answer every policy and route reads, so the status check belongs
-- inside it rather than in each caller.
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

-- ---------------------------------------------------------------------------
-- C. Account locale and personal-scope security settings.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists locale text
    check (locale is null or locale ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$');

create table if not exists public.account_security_settings (
  account_id text primary key references public.profiles(id) on delete cascade,
  mfa_enrolled boolean not null default false,
  ip_allow_list text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_account_security_settings_updated_at
  on public.account_security_settings;
create trigger set_account_security_settings_updated_at
  before update on public.account_security_settings
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- D. Installations: one copy of one app on one device.
-- ---------------------------------------------------------------------------
create table if not exists public.device_installations (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  device_id text not null,
  surface text not null
    check (surface = any (array['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome'])),
  app_version text check (app_version is null or char_length(app_version) <= 64),
  installed_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, device_id, surface)
);

create index if not exists idx_device_installations_account
  on public.device_installations (account_id, last_seen_at desc);

drop trigger if exists set_device_installations_updated_at on public.device_installations;
create trigger set_device_installations_updated_at
  before update on public.device_installations
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- E. The project and device policy scopes.
-- ---------------------------------------------------------------------------
alter table public.organization_policy_overrides
  drop constraint if exists organization_policy_overrides_subject_type_check;
alter table public.organization_policy_overrides
  add constraint organization_policy_overrides_subject_type_check
  check (subject_type in ('role', 'group', 'project', 'device', 'user'));

-- A layer must not outlive its subject, for the two new scopes as well.
create or replace function public.delete_policy_overrides_for_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'user_projects' then
    delete from public.organization_policy_overrides
     where subject_type = 'project' and subject_id = old.id::text;
  elsif tg_table_name = 'device_installations' then
    delete from public.organization_policy_overrides
     where subject_type = 'device' and subject_id = old.device_id;
  end if;
  return old;
end;
$$;

drop trigger if exists delete_project_policy_overrides on public.user_projects;
create trigger delete_project_policy_overrides
  after delete on public.user_projects
  for each row execute function public.delete_policy_overrides_for_scope();

drop trigger if exists delete_device_policy_overrides on public.device_installations;
create trigger delete_device_policy_overrides
  after delete on public.device_installations
  for each row execute function public.delete_policy_overrides_for_scope();

-- ---------------------------------------------------------------------------
-- F. Row level security.
-- ---------------------------------------------------------------------------
grant select on public.workspaces to app_rls;
grant select, insert, update, delete on public.account_security_settings to app_rls;
grant select, insert, update, delete on public.device_installations to app_rls;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read
  on public.workspaces for select to app_rls
  using (
    (kind = 'personal' and owner_account_id = public.current_app_user_id())
    or (
      kind = 'organization'
      and public.app_has_org_permission(organization_id, 'content.read')
    )
  );

alter table public.account_security_settings enable row level security;
alter table public.account_security_settings force row level security;

drop policy if exists account_security_settings_own on public.account_security_settings;
create policy account_security_settings_own
  on public.account_security_settings for all to app_rls
  using (account_id = public.current_app_user_id())
  with check (account_id = public.current_app_user_id());

alter table public.device_installations enable row level security;
alter table public.device_installations force row level security;

drop policy if exists device_installations_own on public.device_installations;
create policy device_installations_own
  on public.device_installations for all to app_rls
  using (account_id = public.current_app_user_id())
  with check (account_id = public.current_app_user_id());

comment on table public.workspaces is
  'The container content lives in. One primary workspace per organization, which is what every organization_id column already names; one personal workspace per account.';
comment on column public.organization_members.is_primary_owner is
  'Generated over role: the one account that can transfer ownership, delete the workspace and manage its billing contract. Distinct from the assignable Owner role.';
comment on table public.device_installations is
  'One copy of one of our apps on one device. Not the device (desktop_devices/mobile_devices) and not a signed-in period of use (account_sessions).';

commit;

-- =============================================================================
-- VERIFICATION: run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. Every organization has exactly one primary workspace:
-- --    SELECT count(*) FROM public.organizations o
-- --     WHERE (SELECT count(*) FROM public.workspaces w
-- --             WHERE w.organization_id = o.id AND w.is_primary) <> 1;  -- EXPECT: 0
--
-- -- 2. Existing members keep their access:
-- --    SELECT count(*) FROM public.organization_members
-- --     WHERE status <> 'active';                                       -- EXPECT: 0
--
-- -- 3. Deprovisioned is terminal:
-- --    UPDATE public.organization_members SET status = 'deprovisioned'
-- --     WHERE organization_id = '<org>' AND user_id = '<user>';
-- --    UPDATE public.organization_members SET status = 'active'
-- --     WHERE organization_id = '<org>' AND user_id = '<user>';
-- --    EXPECT: ERROR membership_deprovisioned_is_terminal
--
-- -- 4. A deprovisioned member holds no permissions:
-- --    SELECT public.organization_member_permissions('<org>', '<user>');  -- EXPECT: {}
--
-- -- 5. The primary workspace cannot be deleted on its own:
-- --    DELETE FROM public.workspaces WHERE is_primary AND organization_id = '<org>';
-- --    EXPECT: ERROR primary_workspace_not_deletable
-- =============================================================================
