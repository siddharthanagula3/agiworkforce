-- Reversal of 0330 : the AGI Workforce app in Slack is removed.
--
-- WHAT THIS COSTS: every Slack installation and its sealed bot token, every
-- linked Slack account, every pending link and every record of a Slack message
-- the app answered is deleted, including any step still waiting for approval.
-- Slack workspaces keep the app installed on Slack's side until an admin
-- removes it there, but it can no longer answer anyone.

begin;

drop policy if exists slack_assistant_runs_owner_delete on public.slack_assistant_runs;
drop policy if exists slack_assistant_runs_owner_update on public.slack_assistant_runs;
drop policy if exists slack_assistant_runs_owner_insert on public.slack_assistant_runs;
drop policy if exists slack_assistant_runs_owner_read on public.slack_assistant_runs;
drop trigger if exists set_slack_assistant_runs_updated_at on public.slack_assistant_runs;
drop index if exists public.idx_slack_assistant_runs_agent_run;
drop index if exists public.idx_slack_assistant_runs_organization;
drop index if exists public.idx_slack_assistant_runs_awaiting;
drop index if exists public.idx_slack_assistant_runs_user;
drop table if exists public.slack_assistant_runs;

drop policy if exists slack_installations_installer_or_linked_read on public.slack_installations;
drop policy if exists slack_account_links_owner_delete on public.slack_account_links;
drop policy if exists slack_account_links_owner_insert on public.slack_account_links;
drop policy if exists slack_account_links_owner_read on public.slack_account_links;
drop trigger if exists set_slack_account_links_updated_at on public.slack_account_links;
drop index if exists public.idx_slack_account_links_organization;
drop index if exists public.idx_slack_account_links_user;
drop table if exists public.slack_account_links;

drop index if exists public.idx_slack_link_requests_expires;
drop table if exists public.slack_link_requests;

drop trigger if exists set_slack_installations_updated_at on public.slack_installations;
drop index if exists public.idx_slack_installations_installed_by;
drop table if exists public.slack_installations;

delete from public.schema_migrations
 where filename = '0330_slack_app.sql';

commit;
