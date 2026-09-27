-- =============================================================================
-- Migration 0308: a scheduled run can pause for the owner's approval
--
-- Why    : a run that reached a tool call the owner's Tool approvals setting
--          asks about could only be stopped and failed, because nobody is
--          present to approve an unattended run. A run now pauses there, the
--          way ChatGPT's scheduled tasks do, and resumes from the same step
--          once the owner approves or denies it.
--
-- Shape  : awaiting_approval is a run status. approval_checkpoint is the tool
--          loop's resume state (transcript, pending calls, step and event
--          cursors, model route) and is read only by the server;
--          approval_request is what the owner is shown (each pending call's
--          name, summary and input). approval_expires_at bounds the wait, and
--          an expired request ends the run. While a run waits, its schedule
--          is paused with paused_reason approval_required so later occurrences
--          do not pile up behind it.
--
-- Depends: 0009 (scheduled_task_runs), 0057, 0301 (paused_reason)
-- =============================================================================

begin;

alter table public.scheduled_task_runs
  drop constraint if exists scheduled_task_runs_status_check,
  add constraint scheduled_task_runs_status_check
    check (status = any (array[
      'running', 'success', 'failed', 'timeout', 'cancelled', 'awaiting_approval'
    ])),
  add column if not exists approval_checkpoint jsonb
    check (approval_checkpoint is null or jsonb_typeof(approval_checkpoint) = 'object'),
  add column if not exists approval_request jsonb
    check (approval_request is null or jsonb_typeof(approval_request) = 'object'),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_expires_at timestamptz;

alter table public.scheduled_tasks
  drop constraint if exists scheduled_tasks_paused_reason_known,
  add constraint scheduled_tasks_paused_reason_known
    check (paused_reason is null or paused_reason = any (array[
      'credit_cap_reached', 'approval_required'
    ]));

create index if not exists scheduled_task_runs_awaiting_approval_idx
  on public.scheduled_task_runs (approval_expires_at)
  where status = 'awaiting_approval';

comment on column public.scheduled_task_runs.approval_checkpoint is
  'Tool loop resume state for a run awaiting approval: transcript, pending calls, cursors and model route. Server-read only; cleared when the run resumes.';
comment on column public.scheduled_task_runs.approval_request is
  'What the owner is asked to approve: each pending tool call with its name, summary and input.';
comment on column public.scheduled_task_runs.approval_expires_at is
  'When an unanswered approval request ends the run.';

commit;
