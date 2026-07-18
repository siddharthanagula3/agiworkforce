-- 0062 — Server-owned Managed Cloud approval checkpoints.
--
-- A client decides only whether a pending tool call may run. The validated
-- transcript, provider continuity data, tool arguments, and event cursor stay
-- tenant-owned on the server and are claimed once under a short execution
-- lease. Versioning allows one run to pause for approval multiple times.

create table public.cloud_agent_approval_checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id text not null,
  version bigint not null check (version > 0),
  session_id text not null check (length(session_id) between 1 and 255),
  turn_id text not null check (length(turn_id) between 1 and 255),
  next_event_sequence bigint not null check (next_event_sequence >= 0),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  messages jsonb not null check (jsonb_typeof(messages) = 'array'),
  pending_tool_calls jsonb not null check (
    jsonb_typeof(pending_tool_calls) = 'array'
    and jsonb_array_length(pending_tool_calls) between 1 and 32
  ),
  state text not null default 'pending' check (
    state in ('pending', 'resuming', 'resolved', 'failed')
  ),
  lease_token uuid,
  lease_expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, version),
  unique (id, user_id),
  foreign key (run_id, user_id)
    references public.cloud_agent_runs(id, user_id)
    on delete cascade,
  check (
    (state = 'resuming' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'resuming' and lease_expires_at is null)
  )
);

create unique index cloud_agent_approval_one_active_per_run_idx
  on public.cloud_agent_approval_checkpoints(run_id)
  where state in ('pending', 'resuming');

create index cloud_agent_approval_user_updated_idx
  on public.cloud_agent_approval_checkpoints(user_id, updated_at desc);

create index cloud_agent_approval_expired_lease_idx
  on public.cloud_agent_approval_checkpoints(lease_expires_at)
  where state = 'resuming';

alter table public.cloud_agent_approval_checkpoints enable row level security;
alter table public.cloud_agent_approval_checkpoints force row level security;

create policy cloud_agent_approval_checkpoints_user_isolation
  on public.cloud_agent_approval_checkpoints
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

revoke all on public.cloud_agent_approval_checkpoints from public;
grant select, insert, update on public.cloud_agent_approval_checkpoints to app_rls;

comment on table public.cloud_agent_approval_checkpoints is
  'Versioned server-owned pause/resume state for tenant-isolated Managed Cloud tool approvals.';
