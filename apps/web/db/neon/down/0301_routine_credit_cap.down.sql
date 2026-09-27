-- Reversal of 0301 : removes routine credit caps and the link from a charge to
-- the routine run that made it.
--
-- WHAT THIS COSTS: every routine's credit cap is deleted, so a routine paused
-- because it reached its cap stays paused but nothing records why, and any
-- routine left enabled runs with no spending limit. The link from each managed
-- usage request to its routine is deleted; the requests and their costs stay.

begin;

drop index if exists public.idx_managed_usage_requests_scheduled_task;

alter table public.managed_usage_requests
  drop constraint if exists managed_usage_requests_scheduled_task_fk;
alter table public.managed_usage_requests
  drop column if exists scheduled_task_run_id,
  drop column if exists scheduled_task_id;

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_paused_reason_known;
alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_credit_cap_positive;
alter table public.scheduled_tasks
  drop column if exists paused_reason,
  drop column if exists credit_cap_microusd;

delete from public.schema_migrations
 where filename = '0301_routine_credit_cap.sql';

commit;
