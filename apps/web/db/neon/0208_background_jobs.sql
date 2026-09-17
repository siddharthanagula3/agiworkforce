-- 0208 : one durable job model for background work.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Agent runs already get durable per-step retries from the Workflow world, so
-- this is not a second agent queue. It carries the background work that had no
-- retry, no dead letter and no fairness: schedule notifications and their
-- email, outbound audit-stream webhooks, scheduled account erasure, upload
-- cleanup, research cost settlement, and event-trigger dispatch.
--
-- A job belongs to a queue whose policy (concurrency, attempts, backoff, lease)
-- lives in apps/web/lib/jobs/job-queues.ts. The drain cron claims with
-- `for update skip locked`, round-robins across tenants (tenant_key is the
-- workspace, else the account, else the platform), honours each queue's
-- concurrency limit, and moves a job that exhausts its attempts or fails
-- permanently to status 'dead' with the reason the admin console shows.
--
-- idempotency_key is unique per queue, so a producer that enqueues the same
-- work twice gets the first job back.
--
-- The drain runs as the service role. app_rls may read the signed-in account's
-- own jobs and enqueue a job for itself in its active workspace, so work
-- running under a claimed user scope (a scheduled run) can hand off without a
-- privileged connection. Erasure: the profile foreign key cascades, and account-erasure
-- names the table explicitly so the export inventory has to answer for it.

begin;

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  queue text not null check (queue ~ '^[a-z][a-z0-9-]{1,39}$'),
  kind text not null check (kind ~ '^[a-z][a-z0-9.-]{1,79}$'),
  user_id text references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  tenant_key text generated always as (
    coalesce('org:' || organization_id::text, 'user:' || user_id, 'platform')
  ) stored,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  priority smallint not null default 0 check (priority between -100 and 100),
  status text not null default 'queued'
    check (status = any (array['queued', 'running', 'succeeded', 'dead', 'cancelled'])),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null check (max_attempts between 1 and 50),
  run_after timestamptz not null default now(),
  lease_expires_at timestamptz,
  idempotency_key text
    check (idempotency_key is null or char_length(idempotency_key) between 8 and 255),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  dead_reason text check (dead_reason is null or char_length(dead_reason) <= 2000),
  dead_lettered_at timestamptz,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint background_jobs_dead_has_reason
    check (status <> 'dead' or (dead_reason is not null and dead_lettered_at is not null)),
  constraint background_jobs_running_has_lease
    check (status <> 'running' or lease_expires_at is not null)
);

create unique index if not exists background_jobs_queue_idempotency_uidx
  on public.background_jobs (queue, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_background_jobs_claimable
  on public.background_jobs (queue, priority desc, run_after asc, id)
  where status = 'queued';

create index if not exists idx_background_jobs_running_lease
  on public.background_jobs (queue, lease_expires_at)
  where status = 'running';

create index if not exists idx_background_jobs_dead
  on public.background_jobs (dead_lettered_at desc)
  where status = 'dead';

create index if not exists idx_background_jobs_finished
  on public.background_jobs (completed_at)
  where status in ('succeeded', 'cancelled');

create index if not exists idx_background_jobs_user
  on public.background_jobs (user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_background_jobs_organization
  on public.background_jobs (organization_id)
  where organization_id is not null;

grant select, insert on public.background_jobs to app_rls;

alter table public.background_jobs enable row level security;
alter table public.background_jobs force row level security;

drop policy if exists background_jobs_owner_read on public.background_jobs;
create policy background_jobs_owner_read
  on public.background_jobs
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists background_jobs_owner_enqueue on public.background_jobs;
create policy background_jobs_owner_enqueue
  on public.background_jobs
  for insert to app_rls
  with check (
    public.app_row_is_writable(user_id, organization_id)
    and status = 'queued'
    and attempts = 0
  );

comment on table public.background_jobs is
  'Durable background jobs with attempts, backoff, priority, per-tenant fair claiming, per-queue concurrency and a dead-letter state. Queue policy lives in apps/web/lib/jobs/job-queues.ts. app_rls sees only the signed-in account''s own jobs.';
comment on column public.background_jobs.tenant_key is
  'Fairness key the claim round-robins over: the workspace, else the account, else the platform.';
comment on column public.background_jobs.dead_reason is
  'Why the job stopped retrying, shown on the admin console dead-letter list.';

commit;
