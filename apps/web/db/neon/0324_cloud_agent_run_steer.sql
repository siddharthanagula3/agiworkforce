-- =============================================================================
-- Migration 0324: a user can message a cloud agent run while it works
--
-- Why    : a running task, whether AGI Work, research or a chat turn using
--          tools, could only be paused and resumed with guidance. Claude Code
--          passes a message typed while it works to the model as soon as the
--          running tool calls finish, within the same turn, and the task keeps
--          its progress.
--
-- Shape  : cloud_agent_runs.pending_steer holds the messages the user sent that
--          the executor has not read yet, as a JSON array of
--          {id, text, queued_at}. The executor takes the array atomically at
--          each step boundary and sets the column back to null. Null means no
--          message is waiting, which is every existing row.
--
-- Depends: 0061 (public.cloud_agent_runs)
-- =============================================================================

begin;

alter table public.cloud_agent_runs
  add column if not exists pending_steer jsonb;

alter table public.cloud_agent_runs
  drop constraint if exists cloud_agent_runs_pending_steer_check,
  add constraint cloud_agent_runs_pending_steer_check
    check (pending_steer is null or jsonb_typeof(pending_steer) = 'array');

comment on column public.cloud_agent_runs.pending_steer is
  'Messages the user sent to the running task that the executor has not read yet: a JSON array of {id, text, queued_at}, cleared when the executor takes them at a step boundary.';

commit;
