-- =============================================================================
-- Migration 0389: reasoning effort per agent
--
-- Why    : an agent could carry its own model, tools and limits, but not how
--          hard its model reasons. Claude Code's subagents take an effort
--          level of low, medium, high, xhigh or max in their definition,
--          overriding the session's level, so a triage agent can run at low
--          and a coding agent at max in the same account.
--
-- Shape  : One nullable effort column on user_agents, limited to the five
--          levels. Null means the chat's own reasoning setting applies. A
--          chat with the agent uses this level unless the person turned
--          reasoning on in the chat and picked a level there; the level maps
--          to the nearest one the turn's model takes.
--
-- Empty  : Existing agents gain null and keep their current behaviour.
--          Published versions in user_agent_versions carry their config as
--          JSON; one published before this migration reads as null.
--
-- Depends: 0370 (user_agents)
-- =============================================================================

begin;

alter table public.user_agents
  add column if not exists effort text
    check (effort is null or effort in ('low', 'medium', 'high', 'xhigh', 'max'));

comment on column public.user_agents.effort is
  'Reasoning effort for this agent''s turns. Null means the chat''s own setting applies.';

commit;
