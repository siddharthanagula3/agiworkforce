-- =============================================================================
-- Migration 0423: reusable cloud environments for AGI Code sessions
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a person sets up the same network access, extra hosts, setup script
--          and variables for every Code session today. An environment keeps
--          those settings under a name, and one of them can be the default a
--          new session starts from. Nothing stores them yet.
--
-- Shape  : one row per saved environment, owned like cloud_code_sessions by a
--          user within a personal or workspace scope. Names are unique per
--          owner and scope, ignoring case, and at most one row per owner and
--          scope is the default. env_vars_encrypted holds the sealed values
--          and env_var_names the names alone, so a list never opens a secret;
--          the two are set together or not at all. A request id makes a
--          retried create return the row it already made.
--
-- Access : forced row level security with the tenant policy every content
--          table uses. app_rls selects, inserts, updates and deletes, because
--          a person deletes their own environment from the app.
--
-- Empty  : a new table; nothing existing is read or rewritten.
--
-- Depends: 0015 (organizations), 0037 (profiles, app_rls), 0076
--          (set_row_updated_at), 0272 (app_row_is_visible, app_row_is_writable)
-- =============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.cloud_code_environments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  network_access text not null default 'trusted' check (
    network_access in ('none', 'trusted', 'full')
  ),
  extra_hosts text[] not null default '{}' check (cardinality(extra_hosts) <= 10),
  allow_package_managers boolean not null default true,
  setup_script text not null default '' check (octet_length(setup_script) <= 16384),
  env_vars_encrypted text,
  env_var_names text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cloud_code_environments_request_key unique (user_id, request_id),
  constraint cloud_code_environments_variables_sealed check (
    (env_vars_encrypted is null) = (cardinality(env_var_names) = 0)
  )
);

create unique index cloud_code_environments_owner_name_key
  on public.cloud_code_environments (
    user_id,
    (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    lower(name)
  );

create unique index cloud_code_environments_owner_default_key
  on public.cloud_code_environments (
    user_id,
    (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where is_default;

create index cloud_code_environments_organization_idx
  on public.cloud_code_environments (organization_id);

create trigger cloud_code_environments_set_updated_at
  before update on public.cloud_code_environments
  for each row execute function public.set_row_updated_at();

revoke all on public.cloud_code_environments from public, app_rls;
grant select, insert, update, delete on public.cloud_code_environments to app_rls;
alter table public.cloud_code_environments enable row level security;
alter table public.cloud_code_environments force row level security;
create policy cloud_code_environments_tenant_isolation
  on public.cloud_code_environments for all to app_rls
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

comment on table public.cloud_code_environments is
  'Saved settings a managed Code session can start from: network access, extra hosts, package registries, setup script and sealed variables, owned like cloud_code_sessions.';
comment on column public.cloud_code_environments.env_vars_encrypted is
  'Sealed variable values; never returned to a client and never opened to build a list.';
comment on column public.cloud_code_environments.env_var_names is
  'Names of the sealed variables, which a list may show; empty exactly when env_vars_encrypted is null.';

commit;
