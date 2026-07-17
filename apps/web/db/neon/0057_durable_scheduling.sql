-- 0057 — Durable, tenant-isolated managed Web schedules.
--
-- 0009 owns the canonical scheduled_tasks / scheduled_task_runs tables. This
-- migration adds occurrence identity and worker leases without rewriting that
-- historical migration, then closes the RLS omission from 0037.

alter table public.scheduled_task_runs
  add column if not exists scheduled_for timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 1;

update public.scheduled_task_runs
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null;

alter table public.scheduled_task_runs
  alter column idempotency_key set not null;

alter table public.scheduled_task_runs
  drop constraint if exists scheduled_task_runs_idempotency_key_length;
alter table public.scheduled_task_runs
  add constraint scheduled_task_runs_idempotency_key_length
    check (length(idempotency_key) between 8 and 255),
  drop constraint if exists scheduled_task_runs_attempt_count_positive;
alter table public.scheduled_task_runs
  add constraint scheduled_task_runs_attempt_count_positive
    check (attempt_count > 0);

create unique index if not exists scheduled_task_runs_task_id_idempotency_key_uidx
  on public.scheduled_task_runs(task_id, idempotency_key);

create index if not exists scheduled_task_runs_expired_lease_idx
  on public.scheduled_task_runs(lease_expires_at)
  where status = 'running' and lease_expires_at is not null;

create index if not exists scheduled_tasks_expires_at_idx
  on public.scheduled_tasks(expires_at)
  where status = 'active' and is_enabled = true and expires_at is not null;

alter table public.scheduled_tasks enable row level security;
alter table public.scheduled_tasks force row level security;

drop policy if exists scheduled_tasks_user_isolation on public.scheduled_tasks;
create policy scheduled_tasks_user_isolation
  on public.scheduled_tasks
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

alter table public.scheduled_task_runs enable row level security;
alter table public.scheduled_task_runs force row level security;

drop policy if exists scheduled_task_runs_user_isolation on public.scheduled_task_runs;
create policy scheduled_task_runs_user_isolation
  on public.scheduled_task_runs
  using (
    task_id in (
      select id from public.scheduled_tasks
      where user_id = public.current_app_user_id()
    )
  )
  with check (
    task_id in (
      select id from public.scheduled_tasks
      where user_id = public.current_app_user_id()
    )
  );
