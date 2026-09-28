-- =============================================================================
-- Migration 0319: a Code turn follows the approval mode and its step limit
--
-- Why    : a cloud Code turn decided on its own which step waited for the
--          user. It ignored the approval mode the Code composer saves, so Ask
--          before every action and Skip approvals behaved alike, and a file
--          edit could only happen through an approved shell command. A turn
--          also stopped at a fixed step count the user could not change.
--
-- Shape  : cloud_code_agent_approvals records the tool a paused step calls
--          and its arguments, so an approved write_file or edit_file runs
--          exactly what the user was shown. Rows written before this
--          migration are run_command approvals whose command is in `command`,
--          which is what the defaults say. `command` now holds what the user
--          reviews, the whole new text of a file edit included, so its limit
--          widens from 2,000 to 100,000 characters. cloud_code_agent_turns.
--          max_steps is the step limit the user chose for the turn; null keeps
--          the default.
--
-- Depends: 0082 (cloud_code_agent_turns, cloud_code_agent_approvals)
-- =============================================================================

begin;

alter table public.cloud_code_agent_approvals
  add column if not exists tool_name text not null default 'run_command',
  add column if not exists tool_args jsonb not null default '{}'::jsonb;

alter table public.cloud_code_agent_approvals
  drop constraint if exists cloud_code_agent_approvals_tool_check,
  add constraint cloud_code_agent_approvals_tool_check
    check (
      length(tool_name) between 1 and 64
      and jsonb_typeof(tool_args) = 'object'
      and octet_length(tool_args::text) <= 1048576
    );

alter table public.cloud_code_agent_approvals
  drop constraint if exists cloud_code_agent_approvals_command_check,
  add constraint cloud_code_agent_approvals_command_check
    check (length(command) between 1 and 100000);

alter table public.cloud_code_agent_turns
  add column if not exists max_steps integer;

alter table public.cloud_code_agent_turns
  drop constraint if exists cloud_code_agent_turns_max_steps_check,
  add constraint cloud_code_agent_turns_max_steps_check
    check (max_steps is null or max_steps between 1 and 200);

commit;
