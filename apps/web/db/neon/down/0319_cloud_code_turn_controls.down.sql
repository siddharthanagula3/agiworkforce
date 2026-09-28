-- Reversal of 0317 : Code approvals hold a shell command of at most 2,000
-- characters, and every turn stops at the default step limit.
--
-- WHAT THIS COSTS: a pending approval for a file edit or for a command longer
-- than 2,000 characters expires, because the release this restores would run a
-- file edit's summary, or a shortened command, as a shell command. Decided
-- approvals keep their first 2,000 characters. The step limit each turn
-- recorded is lost. Other run-command approvals are untouched.

begin;

update public.cloud_code_agent_approvals
   set state = 'expired', decided_at = now()
 where state = 'pending'
   and (tool_name <> 'run_command' or length(command) > 2000);

update public.cloud_code_agent_approvals
   set command = left(command, 2000)
 where length(command) > 2000;

alter table public.cloud_code_agent_turns
  drop constraint if exists cloud_code_agent_turns_max_steps_check,
  drop column if exists max_steps;

alter table public.cloud_code_agent_approvals
  drop constraint if exists cloud_code_agent_approvals_command_check,
  add constraint cloud_code_agent_approvals_command_check
    check (length(command) between 1 and 2000);

alter table public.cloud_code_agent_approvals
  drop constraint if exists cloud_code_agent_approvals_tool_check,
  drop column if exists tool_args,
  drop column if exists tool_name;

delete from public.schema_migrations
 where filename = '0317_cloud_code_turn_controls.sql';

commit;
