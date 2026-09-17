-- Reversal of 0208 : drop the background job model.
--
-- WHAT THIS COSTS: every queued, running and dead-lettered job is deleted.
-- Schedule notifications, audit-stream deliveries, scheduled erasures, upload
-- cleanup, research cost settlement and event-trigger dispatch stop being
-- retried until 0208 is applied again; producers fail to enqueue meanwhile.

begin;

drop policy if exists background_jobs_owner_enqueue on public.background_jobs;
drop policy if exists background_jobs_owner_read on public.background_jobs;
alter table if exists public.background_jobs disable row level security;

drop index if exists public.idx_background_jobs_organization;
drop index if exists public.idx_background_jobs_user;
drop index if exists public.idx_background_jobs_finished;
drop index if exists public.idx_background_jobs_dead;
drop index if exists public.idx_background_jobs_running_lease;
drop index if exists public.idx_background_jobs_claimable;
drop index if exists public.background_jobs_queue_idempotency_uidx;

alter table if exists public.background_jobs
  drop constraint if exists background_jobs_running_has_lease,
  drop constraint if exists background_jobs_dead_has_reason;

drop table if exists public.background_jobs;

delete from public.schema_migrations
 where filename = '0208_background_jobs.sql';

commit;
