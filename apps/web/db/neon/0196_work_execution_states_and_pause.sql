-- 0196 : one Work lifecycle vocabulary for a cloud agent run, and a pause the
-- user can ask for.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- `cloud_agent_runs.state` accepted nine values, so a run planning its work, a
-- run waiting on an approval rather than an answer, a run coming back from a
-- pause, a run that stopped at its step limit with part of the work done, and a
-- run that ran out of time were each stored as a coarser neighbour. The five
-- finer states are added here; every stored value keeps its meaning, and the
-- API still reports the coarse neighbour in `state` for clients built before
-- them, with the finer value in `workState`.
--
-- `pause_requested_at` is the user's request. The executor reads it between
-- steps, the only boundary where the transcript is complete, and records a
-- `pause` checkpoint: the same tenant-owned transcript and event cursor an
-- approval pause keeps, but with no tool call outstanding, so that kind may
-- carry an empty `pending_tool_calls`.

begin;

alter table public.cloud_agent_runs
  drop constraint if exists cloud_agent_runs_state_check;

alter table public.cloud_agent_runs
  add constraint cloud_agent_runs_state_check check (
    state in (
      'queued', 'running', 'awaiting_input', 'ready_for_review', 'completed',
      'failed', 'cancelled', 'paused', 'archived', 'planning', 'awaiting_approval',
      'resuming', 'partial', 'timed_out'
    )
  );

alter table public.cloud_agent_runs
  add column pause_requested_at timestamptz;

drop index if exists public.cloud_agent_runs_active_user_updated_idx;

create index cloud_agent_runs_active_user_updated_idx
  on public.cloud_agent_runs(user_id, updated_at desc)
  where state in (
    'queued', 'planning', 'running', 'resuming', 'awaiting_input',
    'awaiting_approval', 'paused', 'ready_for_review'
  );

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_approval_checkpoints_checkpoint_kind_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_checkpoint_kind_check
    check (checkpoint_kind in ('approval', 'input', 'device', 'pause'));

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_approval_checkpoints_pending_tool_calls_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_pending_tool_calls_check check (
    jsonb_typeof(pending_tool_calls) = 'array'
    and jsonb_array_length(pending_tool_calls) <= 32
    and (checkpoint_kind = 'pause' or jsonb_array_length(pending_tool_calls) >= 1)
  );

comment on column public.cloud_agent_runs.pause_requested_at is
  'When the user asked this run to pause. Cleared when the executor records the pause or the user withdraws the request.';

commit;
