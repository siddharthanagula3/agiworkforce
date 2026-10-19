begin;

drop function if exists public.app_user_agent_month_spend(uuid);
alter table public.user_agents drop column if exists monthly_credit_limit;
drop table if exists public.slack_channel_policies;
delete from public.schema_migrations
 where filename = '0374_slack_channel_policy_and_agent_credit_cap.sql';

commit;
