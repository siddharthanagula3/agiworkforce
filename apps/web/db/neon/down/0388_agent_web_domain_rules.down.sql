-- Reversal of 0388: forget each agent's website rules.
--
-- WHAT THIS COSTS: every agent's allowed and blocked sites are destroyed, and
-- chats with an agent read whatever the workspace and the request allow.
-- Published versions keep the lists in their JSON config but nothing reads
-- them until the columns return. Export the two columns first if any agent
-- has set them.

begin;

alter table public.user_agents
  drop constraint if exists user_agents_web_domain_lists_bounded;

alter table public.user_agents
  drop column if exists blocked_web_domains,
  drop column if exists allowed_web_domains;

delete from public.schema_migrations
 where filename = '0388_agent_web_domain_rules.sql';

commit;
