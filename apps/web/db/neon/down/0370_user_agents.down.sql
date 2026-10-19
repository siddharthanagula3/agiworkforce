begin;

drop function if exists public.app_user_agent_usage(uuid, timestamptz);
drop function if exists public.app_transfer_user_agent(uuid, text);
drop index if exists public.scheduled_tasks_agent_idx;
alter table public.scheduled_tasks drop column if exists agent_id;
drop index if exists public.web_conversations_agent_idx;
alter table public.web_conversations drop column if exists agent_id;
drop table if exists public.user_agent_files;
drop table if exists public.user_agent_access;
drop table if exists public.user_agent_versions;
drop table if exists public.user_agents;
drop function if exists public.app_owns_user_agent(uuid);
delete from public.schema_migrations
 where filename = '0370_user_agents.sql';

commit;
