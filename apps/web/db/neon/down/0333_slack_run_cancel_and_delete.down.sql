-- Reversal of 0333 : a Slack run can no longer end as cancelled or be deleted
-- by its owner.
--
-- WHAT THIS COSTS: every run recorded as cancelled is kept and recorded as
-- failed instead, and disconnecting a Slack account can no longer delete its
-- run records.

begin;

drop policy if exists slack_assistant_runs_owner_delete on public.slack_assistant_runs;
revoke delete on public.slack_assistant_runs from app_rls;

update public.slack_assistant_runs set status = 'failed' where status = 'cancelled';

alter table public.slack_assistant_runs
  drop constraint if exists slack_assistant_runs_status_check;

alter table public.slack_assistant_runs
  add constraint slack_assistant_runs_status_check
    check (status = any (array['running', 'awaiting_approval', 'completed', 'failed', 'expired']));

delete from public.schema_migrations
 where filename = '0333_slack_run_cancel_and_delete.sql';

commit;
