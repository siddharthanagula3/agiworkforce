-- Reversal of 0389: forget each agent's reasoning effort.
--
-- WHAT THIS COSTS: every agent's effort level is destroyed, and chats with an
-- agent reason at whatever level the chat sets. Published versions keep the
-- level in their JSON config but nothing reads it until the column returns.
-- Export the column first if any agent has set it.

begin;

alter table public.user_agents drop column if exists effort;

delete from public.schema_migrations
 where filename = '0389_agent_reasoning_effort.sql';

commit;
