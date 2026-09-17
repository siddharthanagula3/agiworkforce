-- Reversal of 0196 : drop the finer Work states and the user pause.
--
-- WHAT THIS COSTS: every run in a finer state is rewritten to the coarse state
-- clients built before 0196 were shown for it, so planning and resuming runs
-- read as running, an approval wait as awaiting input, and a partial or timed
-- out run as failed. A run paused by its user loses its pause checkpoint and
-- is cancelled, because nothing can resume it once the pause kind is gone.

begin;

update public.cloud_agent_runs
   set state = 'cancelled', completed_at = coalesce(completed_at, now())
 where id in (
   select run_id from public.cloud_agent_approval_checkpoints
    where checkpoint_kind = 'pause' and state in ('pending', 'resuming')
 );

delete from public.cloud_agent_approval_checkpoints
 where checkpoint_kind = 'pause';

update public.cloud_agent_runs
   set state = case state
     when 'planning' then 'running'
     when 'resuming' then 'running'
     when 'awaiting_approval' then 'awaiting_input'
     when 'partial' then 'failed'
     when 'timed_out' then 'failed'
     else state
   end
 where state in ('planning', 'resuming', 'awaiting_approval', 'partial', 'timed_out');

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_approval_checkpoints_pending_tool_calls_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_pending_tool_calls_check check (
    jsonb_typeof(pending_tool_calls) = 'array'
    and jsonb_array_length(pending_tool_calls) between 1 and 32
  );

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_approval_checkpoints_checkpoint_kind_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_checkpoint_kind_check
    check (checkpoint_kind in ('approval', 'input', 'device'));

drop index if exists public.cloud_agent_runs_active_user_updated_idx;

create index cloud_agent_runs_active_user_updated_idx
  on public.cloud_agent_runs(user_id, updated_at desc)
  where state in ('queued', 'running', 'awaiting_input', 'paused', 'ready_for_review');

alter table public.cloud_agent_runs
  drop column if exists pause_requested_at;

alter table public.cloud_agent_runs
  drop constraint if exists cloud_agent_runs_state_check;

alter table public.cloud_agent_runs
  add constraint cloud_agent_runs_state_check check (
    state in (
      'queued', 'running', 'awaiting_input', 'ready_for_review', 'completed',
      'failed', 'cancelled', 'paused', 'archived'
    )
  );

delete from public.schema_migrations
 where filename = '0196_work_execution_states_and_pause.sql';

commit;
