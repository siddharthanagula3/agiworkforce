-- =============================================================================
-- Migration 0335: a Code turn can run in plan mode
--
-- Why    : a cloud Code session had no read-only mode. Claude Code's cloud
--          sessions offer Plan beside their editing modes: the agent reads,
--          explores with commands, and proposes changes without making them.
--          A plan turn that pauses for an approval has to resume as a plan
--          turn, and the approval path rebuilds a turn from its row, so the
--          mode is stored there.
--
-- Shape  : cloud_code_agent_turns.mode is 'agent' or 'plan'. Existing rows,
--          and inserts that name no mode, are agent turns.
--
-- Depends: 0082 (cloud_code_agent_turns), 0319 (turn controls)
-- =============================================================================

begin;

alter table public.cloud_code_agent_turns
  add column if not exists mode text not null default 'agent';

alter table public.cloud_code_agent_turns
  drop constraint if exists cloud_code_agent_turns_mode_check,
  add constraint cloud_code_agent_turns_mode_check check (mode in ('agent', 'plan'));

commit;
