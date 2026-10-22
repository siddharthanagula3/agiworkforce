-- Reversal of 0385 drops every channel's tool choice; channels then allow every
-- tool group again.

begin;

alter table public.slack_channel_policies
  drop constraint if exists slack_channel_policies_allowed_tools_check;
alter table public.slack_channel_policies drop column if exists allowed_tools;

delete from public.schema_migrations where filename = '0385_slack_channel_tool_allow_list.sql';

commit;
