-- 0061 — Durable, tenant-isolated Managed Cloud agent run journal.
--
-- One run is keyed by the already-required managed chat Idempotency-Key. Every
-- canonical AgentEventEnvelope is stored by its per-turn sequence so Web,
-- Desktop, and Mobile can reconnect and replay identical activity. This is the
-- durable event/state foundation; provider/tool checkpoints are added by the
-- workflow execution layer rather than being represented dishonestly here.

create table public.cloud_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  request_id text not null check (length(request_id) between 8 and 128),
  conversation_id uuid references public.web_conversations(id) on delete cascade,
  origin_surface text not null check (
    origin_surface in ('web', 'desktop', 'mobile', 'chrome', 'vscode', 'api')
  ),
  work_mode text not null check (work_mode in ('chat', 'agiwork', 'research')),
  state text not null default 'queued' check (
    state in (
      'queued', 'running', 'awaiting_input', 'ready_for_review', 'completed',
      'failed', 'cancelled', 'paused', 'archived'
    )
  ),
  provider text not null check (length(provider) between 1 and 100),
  model text not null check (length(model) between 1 and 255),
  last_event_sequence bigint not null default -1 check (last_event_sequence >= -1),
  cancellation_requested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  unique (id, user_id)
);

create table public.cloud_agent_events (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  user_id text not null,
  sequence bigint not null check (sequence >= 0),
  emitted_at timestamptz not null,
  event_type text not null check (length(event_type) between 1 and 100),
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object'),
  created_at timestamptz not null default now(),
  unique (run_id, sequence),
  foreign key (run_id, user_id)
    references public.cloud_agent_runs(id, user_id)
    on delete cascade
);

create index cloud_agent_runs_active_user_updated_idx
  on public.cloud_agent_runs(user_id, updated_at desc)
  where state in ('queued', 'running', 'awaiting_input', 'paused', 'ready_for_review');

create index cloud_agent_runs_conversation_updated_idx
  on public.cloud_agent_runs(conversation_id, updated_at desc)
  where conversation_id is not null;

create index cloud_agent_events_run_sequence_idx
  on public.cloud_agent_events(run_id, sequence asc);

alter table public.cloud_agent_runs enable row level security;
alter table public.cloud_agent_runs force row level security;

create policy cloud_agent_runs_user_isolation
  on public.cloud_agent_runs
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

alter table public.cloud_agent_events enable row level security;
alter table public.cloud_agent_events force row level security;

create policy cloud_agent_events_user_isolation
  on public.cloud_agent_events
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.cloud_agent_runs is
  'Tenant-owned Managed Cloud agent execution state keyed by the managed chat idempotency key.';

comment on table public.cloud_agent_events is
  'Ordered canonical AgentEventEnvelope replay journal for Web, Desktop, and Mobile Cloud clients.';
