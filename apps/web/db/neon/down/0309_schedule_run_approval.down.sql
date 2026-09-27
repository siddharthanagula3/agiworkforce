-- Reversal of 0309 : scheduled runs can no longer pause for approval.
--
-- WHAT THIS COSTS: every run still waiting for its owner's approval is ended
-- as cancelled and its resume state is dropped, so those steps never run;
-- the schedules they paused stay paused until their owners resume them. A
-- run that needs approval goes back to failing with the unattended-run error.

begin;

update public.scheduled_task_runs
   set status = 'cancelled',
       completed_at = coalesce(completed_at, now()),
       error = coalesce(error, 'The run was waiting for approval when approvals were withdrawn')
 where status = 'awaiting_approval';

update public.scheduled_tasks
   set paused_reason = null
 where paused_reason = 'approval_required';

drop index if exists public.scheduled_task_runs_awaiting_approval_idx;

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_paused_reason_known,
  add constraint scheduled_tasks_paused_reason_known
    check (paused_reason is null or paused_reason = 'credit_cap_reached');

alter table public.scheduled_task_runs
  drop column if exists approval_expires_at,
  drop column if exists approval_requested_at,
  drop column if exists approval_request,
  drop column if exists approval_checkpoint,
  drop constraint if exists scheduled_task_runs_status_check,
  add constraint scheduled_task_runs_status_check
    check (status = any (array['running', 'success', 'failed', 'timeout', 'cancelled']));

delete from public.schema_migrations
 where filename = '0309_schedule_run_approval.sql';

commit;
