-- =============================================================================
-- Migration 0201: workspace policy layers and policy revisions
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : `organization_admin_policies` holds one row per workspace, so a
--          control is on for everyone or off for everyone. An administrator
--          could not turn Code on for engineering only, keep Research from a
--          contractor group, or grant one person an exception. And a client had
--          no way to learn that policy had changed except to re-read all of it.
--
-- Shape  : `organization_policy_overrides` holds one layer per subject: a role
--          (organization_roles.id), a directory group (scim_groups.id) or a
--          user. A layer carries only the controls it sets (feature access,
--          default model, maximum reasoning effort, allowed countries, allowed
--          client surfaces). Resolution order is workspace defaults, then
--          roles, then groups, then user exceptions; inside one tier the most
--          restrictive value wins (`resolveWorkspaceControls` in
--          packages/contracts/types).
--
--          `organization_policy_revisions` is an append-only counter per
--          workspace. Every write to the admin policy, the model policy, the
--          connector policy, an override, a role or a role grant appends one
--          revision, so a client that remembers the last revision it saw can
--          poll one cheap row and refetch only when it moved.
--
-- Empty  : No override rows are created and no workspace gains a revision
--          until something is written, so applying this changes no decision.
--
-- Depends: 0076 (organization_admin_policies), 0084 (scim_groups), 0139
--          (organization_model_policies), 0141 (organization_connector_policies),
--          0200 (organization_roles, grant tables, app_has_org_permission)
-- =============================================================================

begin;

create table if not exists public.organization_policy_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null check (subject_type in ('role', 'group', 'user')),
  subject_id text not null check (char_length(subject_id) between 1 and 255),
  layer jsonb not null default '{}'::jsonb check (
    jsonb_typeof(layer) = 'object'
    and octet_length(layer::text) <= 16384
  ),
  created_by_user_id text,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, subject_type, subject_id)
);

create index if not exists idx_organization_policy_overrides_subject
  on public.organization_policy_overrides (subject_type, subject_id);

drop trigger if exists set_organization_policy_overrides_updated_at
  on public.organization_policy_overrides;
create trigger set_organization_policy_overrides_updated_at
  before update on public.organization_policy_overrides
  for each row execute function public.set_row_updated_at();

-- A layer must not outlive its subject. Removing a role, a group or a member
-- removes the exception written for it, so a returning user or a recreated
-- group never inherits a stale grant.
create or replace function public.delete_policy_overrides_for_subject()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'organization_roles' then
    delete from public.organization_policy_overrides
     where subject_type = 'role' and subject_id = old.id::text;
  elsif tg_table_name = 'scim_groups' then
    delete from public.organization_policy_overrides
     where organization_id = old.organization_id
       and subject_type = 'group' and subject_id = old.id::text;
  elsif tg_table_name = 'organization_members' then
    delete from public.organization_policy_overrides
     where organization_id = old.organization_id
       and subject_type = 'user' and subject_id = old.user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists delete_role_policy_overrides on public.organization_roles;
create trigger delete_role_policy_overrides
  after delete on public.organization_roles
  for each row execute function public.delete_policy_overrides_for_subject();

drop trigger if exists delete_group_policy_overrides on public.scim_groups;
create trigger delete_group_policy_overrides
  after delete on public.scim_groups
  for each row execute function public.delete_policy_overrides_for_subject();

drop trigger if exists delete_member_policy_overrides on public.organization_members;
create trigger delete_member_policy_overrides
  after delete on public.organization_members
  for each row execute function public.delete_policy_overrides_for_subject();

create table if not exists public.organization_policy_revisions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision bigint not null check (revision > 0),
  source text not null check (char_length(source) between 1 and 80),
  changed_by_user_id text,
  changed_at timestamptz not null default now(),
  primary key (organization_id, revision)
);

create or replace function public.record_organization_policy_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  actor text;
begin
  if tg_op = 'DELETE' then
    target_org := old.organization_id;
  else
    target_org := new.organization_id;
  end if;

  if target_org is null then
    return null;
  end if;

  if not exists (select 1 from public.organizations where id = target_org) then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agi:organization-policy-revision:' || target_org::text, 0)
  );

  actor := nullif(public.current_app_user_id(), '');

  insert into public.organization_policy_revisions
    (organization_id, revision, source, changed_by_user_id)
  select target_org, coalesce(max(r.revision), 0) + 1, tg_table_name, actor
    from public.organization_policy_revisions r
   where r.organization_id = target_org;

  return null;
end;
$$;

do $$
declare
  t text;
  revisioned text[] := array[
    'organization_admin_policies',
    'organization_model_policies',
    'organization_connector_policies',
    'organization_policy_overrides',
    'organization_roles',
    'organization_member_roles',
    'organization_group_roles'
  ];
begin
  foreach t in array revisioned loop
    execute format(
      'drop trigger if exists record_policy_revision on public.%I', t
    );
    execute format(
      'create trigger record_policy_revision after insert or update or delete on public.%I '
      'for each row execute function public.record_organization_policy_revision()',
      t
    );
  end loop;
end $$;

grant select, insert, update, delete on public.organization_policy_overrides to app_rls;
grant select on public.organization_policy_revisions to app_rls;
revoke insert, update, delete on public.organization_policy_revisions from app_rls;

alter table public.organization_policy_overrides enable row level security;
alter table public.organization_policy_overrides force row level security;

drop policy if exists organization_policy_overrides_read on public.organization_policy_overrides;
create policy organization_policy_overrides_read
  on public.organization_policy_overrides for select to app_rls
  using (
    public.app_has_org_permission(organization_id, 'policy.manage')
    or (subject_type = 'user' and subject_id = public.current_app_user_id())
  );

drop policy if exists organization_policy_overrides_write on public.organization_policy_overrides;
create policy organization_policy_overrides_write
  on public.organization_policy_overrides for all to app_rls
  using (public.app_has_org_permission(organization_id, 'policy.manage'))
  with check (public.app_has_org_permission(organization_id, 'policy.manage'));

alter table public.organization_policy_revisions enable row level security;
alter table public.organization_policy_revisions force row level security;

drop policy if exists organization_policy_revisions_member_read on public.organization_policy_revisions;
create policy organization_policy_revisions_member_read
  on public.organization_policy_revisions for select to app_rls
  using (public.app_has_org_permission(organization_id, 'content.read'));

comment on table public.organization_policy_overrides is
  'Policy layers over the workspace defaults for one role, directory group or user. Resolution: workspace, role, group, user; most restrictive inside a tier.';
comment on table public.organization_policy_revisions is
  'Append-only policy revision counter per workspace, written by trigger on every policy, override, role and role grant change. Clients poll the maximum revision.';

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. Nothing is layered and nothing is revisioned on apply:
-- --    SELECT count(*) FROM public.organization_policy_overrides;  -- EXPECT: 0
-- --    SELECT count(*) FROM public.organization_policy_revisions;  -- EXPECT: 0
--
-- -- 2. A policy save moves the revision:
-- --    UPDATE public.organization_admin_policies SET allow_memory = allow_memory
-- --     WHERE organization_id = '<org>';
-- --    SELECT max(revision) FROM public.organization_policy_revisions
-- --     WHERE organization_id = '<org>';                           -- EXPECT: 1
--
-- -- 3. Revisions are not application-writable:
-- --    SET ROLE app_rls;
-- --    INSERT INTO public.organization_policy_revisions VALUES ('<org>', 99, 'x', null, now());
-- --    EXPECT: ERROR permission denied
-- =============================================================================
