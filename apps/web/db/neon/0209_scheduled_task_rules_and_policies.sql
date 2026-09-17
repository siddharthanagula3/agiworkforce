-- 0209 : recurrence rules, dayparts, retry, missed-run policy and condition
-- watches on scheduled tasks, plus event-only tasks.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- scheduled_tasks (0009) could only fire on a cron expression, a fixed interval
-- or once, and a failed run simply waited for the next occurrence. This adds:
--
--   schedule_type 'rrule'  an RFC 5545 recurrence rule (the subset
--                          apps/web/lib/schedules/recurrence-rule.ts parses),
--                          stored with its DTSTART anchor in recurrence_rule.
--   schedule_type 'event'  a task with no clock schedule that only runs when an
--                          event trigger (0210) fires it.
--   dayparts               local time windows an occurrence must fall inside;
--                          occurrences outside every window are skipped.
--   retry_*                re-run a failed or timed-out scheduled run with
--                          exponential backoff; retry_attempt counts the retries
--                          already spent on retry_scheduled_for's occurrence.
--   missed_execution_policy what a sweep does with an occurrence it finds late:
--                          'run_once' runs it once (never once per missed slot),
--                          'skip' records it as skipped. Either way the run row
--                          and the audit log say it was missed.
--   condition, condition_state  a watch evaluated at fire time; the run only
--                          happens when the condition holds, and the last check
--                          is kept so the page can show it.
--
-- Existing rows keep their behaviour: no rule, no dayparts, no retries, run a
-- missed occurrence once, no condition.

begin;

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_schedule_type_check;
alter table public.scheduled_tasks
  add constraint scheduled_tasks_schedule_type_check
    check (schedule_type = any (array['cron', 'once', 'interval', 'rrule', 'event']));

alter table public.scheduled_tasks
  add column if not exists recurrence_rule text,
  add column if not exists dayparts jsonb,
  add column if not exists retry_max_attempts smallint not null default 0,
  add column if not exists retry_backoff_seconds integer not null default 300,
  add column if not exists retry_attempt smallint not null default 0,
  add column if not exists retry_scheduled_for timestamptz,
  add column if not exists missed_execution_policy text not null default 'run_once',
  add column if not exists condition jsonb,
  add column if not exists condition_state jsonb;

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_recurrence_rule_shape,
  drop constraint if exists scheduled_tasks_dayparts_shape,
  drop constraint if exists scheduled_tasks_retry_bounds,
  drop constraint if exists scheduled_tasks_missed_execution_policy_check,
  drop constraint if exists scheduled_tasks_condition_shape;
alter table public.scheduled_tasks
  add constraint scheduled_tasks_recurrence_rule_shape
    check (
      (schedule_type = 'rrule' and recurrence_rule is not null and char_length(recurrence_rule) <= 512)
      or (schedule_type <> 'rrule' and recurrence_rule is null)
    ),
  add constraint scheduled_tasks_dayparts_shape
    check (dayparts is null or (jsonb_typeof(dayparts) = 'array' and jsonb_array_length(dayparts) between 1 and 7)),
  add constraint scheduled_tasks_retry_bounds
    check (
      retry_max_attempts between 0 and 5
      and retry_backoff_seconds between 60 and 86400
      and retry_attempt between 0 and retry_max_attempts
    ),
  add constraint scheduled_tasks_missed_execution_policy_check
    check (missed_execution_policy = any (array['run_once', 'skip'])),
  add constraint scheduled_tasks_condition_shape
    check (condition is null or (jsonb_typeof(condition) = 'object' and pg_column_size(condition) <= 4096));

comment on column public.scheduled_tasks.recurrence_rule is
  'RFC 5545 DTSTART and RRULE lines for schedule_type rrule, in the subset lib/schedules/recurrence-rule.ts parses.';
comment on column public.scheduled_tasks.dayparts is
  'Local time windows ({days, start, end}) an occurrence must fall inside; null means any time.';
comment on column public.scheduled_tasks.retry_attempt is
  'Retries already spent on the occurrence in retry_scheduled_for; reset to 0 when an occurrence settles.';
comment on column public.scheduled_tasks.missed_execution_policy is
  'run_once runs a late occurrence once; skip records it as skipped. Both are recorded on the run and audited.';
comment on column public.scheduled_tasks.condition is
  'Condition watch evaluated at fire time; the run happens only when it holds.';

commit;
