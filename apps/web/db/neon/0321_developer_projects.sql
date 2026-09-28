-- =============================================================================
-- Migration 0319: developer projects that scope API keys, usage and spend
--
-- Why    : every API key belonged to the account as a whole, so a developer
--          could not keep a staging key apart from a production one, see what
--          each key spent, or cap what one integration may spend. OpenAI
--          projects and Claude Console workspaces scope keys, usage and spend
--          limits this way.
--
-- Shape  : developer_projects holds a person's projects, each with an
--          optional monthly credit limit; archiving is one-way and revokes the
--          project's keys in the same request. api_keys.project_id places a key
--          in a project, and a key without one is in the default project.
--          managed_usage_requests.api_key_id records which key made a managed
--          request, so usage can be read per key and per project. Every column
--          is nullable, so code that predates this migration keeps working.
--
-- Depends: 0005 (api_keys), 0037 (profiles, current_app_user_id),
--          0056 (managed_usage_requests), 0076 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.developer_projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  monthly_credit_limit bigint check (monthly_credit_limit is null or monthly_credit_limit > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_developer_projects_updated_at on public.developer_projects;
create trigger set_developer_projects_updated_at
  before update on public.developer_projects
  for each row execute function public.set_row_updated_at();

create index if not exists idx_developer_projects_user
  on public.developer_projects (user_id, created_at desc);

create unique index if not exists idx_developer_projects_live_name
  on public.developer_projects (user_id, lower(btrim(name)))
  where archived_at is null;

revoke all on public.developer_projects from app_rls;
grant select, insert, update on public.developer_projects to app_rls;

alter table public.developer_projects enable row level security;
alter table public.developer_projects force row level security;

drop policy if exists developer_projects_owner on public.developer_projects;
create policy developer_projects_owner
  on public.developer_projects for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

alter table public.api_keys
  add column if not exists project_id uuid references public.developer_projects(id) on delete set null;

create index if not exists idx_api_keys_project
  on public.api_keys (project_id)
  where project_id is not null;

alter table public.managed_usage_requests
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null;

create index if not exists idx_managed_usage_requests_api_key_created
  on public.managed_usage_requests (api_key_id, created_at desc)
  where api_key_id is not null;

commit;
