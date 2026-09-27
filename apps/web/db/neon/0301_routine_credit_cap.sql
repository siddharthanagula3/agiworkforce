-- =============================================================================
-- Migration 0301: a credit cap per routine, from the credits its runs consumed
--
-- Why    : a routine could be limited by a number of runs and an expiry, never
--          by what it spends, and nothing tied a charge to the routine that
--          caused it.
--
-- Shape  : scheduled_tasks.credit_cap_microusd is the cap the owner set, in the
--          ledger unit. paused_reason says why a routine stopped on its own,
--          today only because it reached that cap. Every managed usage request
--          made while a routine runs, including its tool and search charges,
--          carries scheduled_task_id and scheduled_task_run_id, so the credits a
--          routine has consumed are the settled cost of its own requests.
--
-- Depends: 0009 (scheduled_tasks), 0056 (managed_usage_requests), 0182 (microUSD)
-- =============================================================================

begin;

alter table public.scheduled_tasks
  add column if not exists credit_cap_microusd bigint
    constraint scheduled_tasks_credit_cap_positive
      check (credit_cap_microusd is null or credit_cap_microusd > 0),
  add column if not exists paused_reason text
    constraint scheduled_tasks_paused_reason_known
      check (paused_reason is null or paused_reason = 'credit_cap_reached');

alter table public.managed_usage_requests
  add column if not exists scheduled_task_id uuid
    constraint managed_usage_requests_scheduled_task_fk
      references public.scheduled_tasks(id) on delete set null,
  add column if not exists scheduled_task_run_id uuid;

create index if not exists idx_managed_usage_requests_scheduled_task
  on public.managed_usage_requests (scheduled_task_id, scheduled_task_run_id)
  where scheduled_task_id is not null;

comment on column public.scheduled_tasks.credit_cap_microusd is
  'The most this routine may consume across all its runs, in microUSD. NULL is no cap. Checked before each run against the settled cost of the managed usage requests that carry this task id.';
comment on column public.scheduled_tasks.paused_reason is
  'Why the routine paused itself. credit_cap_reached: its runs consumed its credit cap. Cleared when it is enabled again.';
comment on column public.managed_usage_requests.scheduled_task_id is
  'The routine whose run made this request, set when the request is reserved inside that run.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A cap of zero is refused:
-- --    UPDATE public.scheduled_tasks SET credit_cap_microusd = 0 WHERE false;
-- --    EXPECT: no error; with a real id, ERROR violates "scheduled_tasks_credit_cap_positive".
-- -- 2. Deleting a routine keeps its charges and drops the link:
-- --    DELETE FROM public.scheduled_tasks WHERE id = '<task>';
-- --    SELECT count(*) FROM public.managed_usage_requests WHERE scheduled_task_id = '<task>';  -- EXPECT 0
-- =============================================================================
