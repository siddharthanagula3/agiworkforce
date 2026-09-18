-- 0249 : who is running a background job, how it is cancelled, and what it cost.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0208 gave every job a lease but never recorded which worker holds it. A lease
-- that lapses while the worker is still alive is reaped and re-claimed, and the
-- first worker's completeJob/failJob then lands on the second worker's attempt:
-- the same attempt number, a different execution. worker_id is the fence. A
-- write from a worker that no longer owns the row matches nothing and is
-- reported as stale instead of overwriting a live attempt.
--
-- Cancellation is cooperative, not a status flip. A running job carries a
-- cancel request (cancel_requested_at, cancel_reason) that the worker that owns
-- the lease observes and acknowledges; only then does the row reach 'cancelled'.
-- Flipping the status under a running worker would orphan the lease and let the
-- side effect the job was in the middle of finish uncounted. A queued job has
-- no worker, so its cancellation is immediate.
--
-- usage is what the job consumed, which until now could only be smuggled back
-- through the free-form result. retry_reason is the class of the last failure,
-- taken from the shared retry taxonomy in packages/platform/utils, so a queue's
-- failures can be grouped by cause rather than by error prose.

begin;

alter table public.background_jobs
  add column if not exists worker_id text
    check (worker_id is null or char_length(worker_id) between 1 and 128),
  add column if not exists usage jsonb
    check (usage is null or (jsonb_typeof(usage) = 'object' and pg_column_size(usage) <= 8192)),
  add column if not exists retry_reason text
    check (retry_reason is null or char_length(retry_reason) between 1 and 64),
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_requested_by text
    check (cancel_requested_by is null or char_length(cancel_requested_by) between 1 and 255),
  add column if not exists cancel_reason text
    check (cancel_reason is null or char_length(cancel_reason) <= 500);

-- The reaper finishes a cancellation whose worker died holding the lease, and
-- reaches those rows by queue.
create index if not exists idx_background_jobs_cancel_requested
  on public.background_jobs (queue, cancel_requested_at)
  where cancel_requested_at is not null and status = 'running';

comment on column public.background_jobs.worker_id is
  'The worker that holds the current lease. Every write that settles an attempt is fenced on it, so a worker whose lease was reaped cannot settle the attempt that replaced it.';
comment on column public.background_jobs.cancel_requested_at is
  'When cancellation was asked for. A running job stays running until the worker that owns the lease acknowledges it; a queued job is cancelled outright.';
comment on column public.background_jobs.retry_reason is
  'The class of the last failure, from the shared retry taxonomy, not the error text.';
comment on column public.background_jobs.usage is
  'What the job consumed: tokens, cost in microUSD, units, wall-clock. Null when the job reports none.';

commit;
