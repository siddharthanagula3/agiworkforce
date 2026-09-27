-- Reversal of 0309 : notifications stop pointing at an AGI Code session.
--
-- WHAT THIS COSTS: feed rows that open a Code session lose their target and
-- stay in the feed as plain notices, because the narrower constraint cannot
-- return while such rows exist. Titles, messages and read flags are kept.

begin;

update public.notifications
   set target_kind = null,
       target_id = null
 where target_kind = 'code-session';

alter table public.notifications
  drop constraint if exists notifications_target_check,
  add constraint notifications_target_check
    check (
      (target_kind is null and target_id is null)
      or (
        target_kind in (
          'chat', 'file', 'artifact', 'work', 'research', 'schedule', 'browser-task', 'settings'
        )
        and target_id is not null
        and length(target_id) between 1 and 128
      )
    );

delete from public.schema_migrations
 where filename = '0309_notification_code_session_target.sql';

commit;
