-- =============================================================================
-- Migration 0333: a Slack run can end as cancelled and be deleted by its owner
--
-- Why    : a channel mention can now run as an AGI Work task, which the person
--          may stop on the Tasks page; the run that took the mention up then
--          ends as cancelled rather than failed. Claude in Slack deletes a
--          person's Slack conversations when they disconnect, so disconnecting
--          a Slack account now deletes the run records it left instead of only
--          expiring the ones waiting for approval.
--
-- Shape  : slack_assistant_runs.status also allows cancelled. app_rls may
--          delete slack_assistant_runs rows, and the owner delete policy limits
--          that to the account's own runs. Additive: the status check only
--          widens, and no existing row changes.
--
-- Depends: 0037 (current_app_user_id), 0330 (slack_assistant_runs)
-- =============================================================================

begin;

alter table public.slack_assistant_runs
  drop constraint if exists slack_assistant_runs_status_check;

alter table public.slack_assistant_runs
  add constraint slack_assistant_runs_status_check
    check (
      status = any (array['running', 'awaiting_approval', 'completed', 'failed', 'expired', 'cancelled'])
    );

grant delete on public.slack_assistant_runs to app_rls;

drop policy if exists slack_assistant_runs_owner_delete on public.slack_assistant_runs;
create policy slack_assistant_runs_owner_delete
  on public.slack_assistant_runs for delete to app_rls
  using (user_id = (select public.current_app_user_id()));

commit;
