-- 0063 — Replay-safe durable execution receipts for Managed Cloud agent workflows.
--
-- Vercel Workflow steps are retried at least once. Every provider or tool side
-- effect therefore receives a tenant-owned operation key and result receipt.
-- Completed operations replay their stored result; an expired unsafe lease is
-- marked outcome_unknown and is never silently executed a second time.

alter table public.cloud_agent_runs
  add column workflow_run_id text
    check (workflow_run_id is null or length(workflow_run_id) between 1 and 255);

alter table public.cloud_agent_approval_checkpoints
  add column completed_steps integer not null default 0
    check (completed_steps >= 0);

create unique index cloud_agent_runs_workflow_run_id_idx
  on public.cloud_agent_runs(workflow_run_id)
  where workflow_run_id is not null;

create table public.cloud_agent_execution_operations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id text not null,
  operation_key text not null check (length(operation_key) between 1 and 255),
  operation_kind text not null check (operation_kind in ('provider', 'tool')),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  retry_safety text not null check (retry_safety in ('safe', 'unsafe')),
  status text not null default 'running' check (
    status in ('running', 'completed', 'failed', 'outcome_unknown')
  ),
  attempt integer not null default 1 check (attempt > 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, operation_key),
  unique (id, user_id),
  foreign key (run_id, user_id)
    references public.cloud_agent_runs(id, user_id)
    on delete cascade,
  check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'running' and lease_token is null and lease_expires_at is null)
  ),
  check (status <> 'completed' or (result is not null and completed_at is not null))
);

create index cloud_agent_execution_expired_lease_idx
  on public.cloud_agent_execution_operations(lease_expires_at)
  where status = 'running';

create index cloud_agent_execution_run_updated_idx
  on public.cloud_agent_execution_operations(run_id, updated_at desc);

alter table public.cloud_agent_execution_operations enable row level security;
alter table public.cloud_agent_execution_operations force row level security;

create policy cloud_agent_execution_operations_user_isolation
  on public.cloud_agent_execution_operations
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

revoke all on public.cloud_agent_execution_operations from public;
grant select, insert, update on public.cloud_agent_execution_operations to app_rls;

comment on column public.cloud_agent_runs.workflow_run_id is
  'Vercel Workflow run that owns the restart-safe execution of this Cloud agent run.';

comment on table public.cloud_agent_execution_operations is
  'Idempotent provider/tool step receipts used to prevent duplicate paid or mutating side effects.';

comment on column public.cloud_agent_approval_checkpoints.completed_steps is
  'Provider-step cursor carried across durable invocation and approval boundaries.';
