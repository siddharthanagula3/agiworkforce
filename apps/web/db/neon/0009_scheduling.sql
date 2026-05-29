create table if not exists public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text,
  schedule_type text not null check (schedule_type = any (array['cron', 'once', 'interval'])),
  cron_expression text,
  execute_at timestamptz,
  interval_ms bigint,
  timezone text not null default 'UTC',
  is_enabled boolean not null default true,
  expires_at timestamptz,
  max_executions integer,
  execution_count integer not null default 0,
  action_type text not null check (action_type = any (array['agent', 'workflow', 'notification', 'command'])),
  action_config jsonb,
  prompt text,
  model text,
  status text not null default 'active'
    check (status = any (array['active', 'paused', 'completed', 'failed', 'expired'])),
  last_executed_at timestamptz,
  next_execution_at timestamptz,
  last_error text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_tasks_user_id on public.scheduled_tasks(user_id);
create index if not exists idx_scheduled_tasks_next_execution
  on public.scheduled_tasks(next_execution_at)
  where is_enabled = true and status = 'active';

create table if not exists public.scheduled_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.scheduled_tasks(id) on delete cascade,
  status text not null default 'running'
    check (status = any (array['running', 'success', 'failed', 'timeout', 'cancelled'])),
  trigger_source text not null default 'schedule'
    check (trigger_source = any (array['schedule', 'manual', 'webhook', 'api'])),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  result jsonb,
  error text
);

create index if not exists idx_scheduled_task_runs_task_id
  on public.scheduled_task_runs(task_id);
