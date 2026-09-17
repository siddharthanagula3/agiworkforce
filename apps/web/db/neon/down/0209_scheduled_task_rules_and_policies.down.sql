-- Reversal of 0209 : remove recurrence rules, dayparts, retries, missed-run
-- policy, condition watches and event-only tasks from scheduled_tasks.
--
-- WHAT THIS COSTS: every rrule and event-only task is deleted, because the
-- restored schedule_type check cannot hold them; their run history cascades.
-- Other tasks lose their dayparts, retry policy, missed-run policy and
-- condition, and fall back to firing on every occurrence with no retry.

begin;

delete from public.scheduled_tasks where schedule_type = any (array['rrule', 'event']);

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_condition_shape,
  drop constraint if exists scheduled_tasks_missed_execution_policy_check,
  drop constraint if exists scheduled_tasks_retry_bounds,
  drop constraint if exists scheduled_tasks_dayparts_shape,
  drop constraint if exists scheduled_tasks_recurrence_rule_shape;

alter table public.scheduled_tasks
  drop column if exists condition_state,
  drop column if exists condition,
  drop column if exists missed_execution_policy,
  drop column if exists retry_scheduled_for,
  drop column if exists retry_attempt,
  drop column if exists retry_backoff_seconds,
  drop column if exists retry_max_attempts,
  drop column if exists dayparts,
  drop column if exists recurrence_rule;

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_schedule_type_check;
alter table public.scheduled_tasks
  add constraint scheduled_tasks_schedule_type_check
    check (schedule_type = any (array['cron', 'once', 'interval']));

delete from public.schema_migrations
 where filename = '0209_scheduled_task_rules_and_policies.sql';

commit;
