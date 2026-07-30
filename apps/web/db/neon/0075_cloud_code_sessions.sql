-- 0075 — Durable, tenant-isolated managed Code sessions and terminal journal.
--
-- Provider sandbox identifiers remain in the server-side Redis lifecycle store.
-- These tables persist only product state and bounded command results so a user
-- can attach from another request without exposing provider credentials.

create table public.cloud_code_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  request_id text not null check (length(request_id) between 8 and 128),
  title text not null check (length(title) between 1 and 120),
  repository_url text check (
    repository_url is null or length(repository_url) between 1 and 500
  ),
  network_access text not null default 'none' check (
    network_access in ('none', 'trusted', 'full')
  ),
  state text not null default 'provisioning' check (
    state in ('provisioning', 'ready', 'running', 'failed', 'closed')
  ),
  workspace_path text not null default '/home/user' check (
    workspace_path in ('/home/user', '/home/user/project')
  ),
  last_error text check (last_error is null or length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (user_id, request_id),
  unique (id, user_id)
);

create table public.cloud_code_terminal_entries (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  command text not null check (length(command) between 1 and 2000),
  stdout text not null default '' check (octet_length(stdout) <= 100000),
  stderr text not null default '' check (octet_length(stderr) <= 100000),
  exit_code integer not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  foreign key (session_id, user_id)
    references public.cloud_code_sessions(id, user_id)
    on delete cascade
);

create index cloud_code_sessions_user_updated_idx
  on public.cloud_code_sessions(user_id, updated_at desc);

create index cloud_code_sessions_active_user_idx
  on public.cloud_code_sessions(user_id, updated_at desc)
  where state in ('provisioning', 'ready', 'running');

create index cloud_code_terminal_entries_session_id_idx
  on public.cloud_code_terminal_entries(session_id, id asc);

alter table public.cloud_code_sessions enable row level security;
alter table public.cloud_code_sessions force row level security;

create policy cloud_code_sessions_tenant_isolation
  on public.cloud_code_sessions
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

alter table public.cloud_code_terminal_entries enable row level security;
alter table public.cloud_code_terminal_entries force row level security;

create policy cloud_code_terminal_entries_tenant_isolation
  on public.cloud_code_terminal_entries
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

grant select, insert, update, delete on public.cloud_code_sessions to app_rls;
grant select, insert, update, delete on public.cloud_code_terminal_entries to app_rls;
grant usage, select on sequence public.cloud_code_terminal_entries_id_seq to app_rls;

comment on table public.cloud_code_sessions is
  'Tenant-owned managed Code session state; provider sandbox identifiers are never client-visible.';

comment on table public.cloud_code_terminal_entries is
  'Bounded, ordered terminal command journal for managed Code sessions.';
