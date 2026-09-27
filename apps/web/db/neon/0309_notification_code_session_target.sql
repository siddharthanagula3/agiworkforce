-- =============================================================================
-- Migration 0309: an in-app notification can open an AGI Code session
--
-- Why    : a cloud Code turn that waits for an approval, finishes, or stops
--          on a failure now notifies the user's other devices, and the feed
--          row it writes has to open that session. notifications_target_check
--          (0199) admits only the kinds that existed then, so the row had no
--          target and the notice could not be followed.
--
-- Shape  : target_kind accepts 'code-session', whose target_id is the Code
--          session's id. The other kinds and the target_id length bound are
--          unchanged.
--
-- Depends: 0199 (notifications.target_kind, notifications_target_check)
-- =============================================================================

begin;

alter table public.notifications
  drop constraint if exists notifications_target_check,
  add constraint notifications_target_check
    check (
      (target_kind is null and target_id is null)
      or (
        target_kind in (
          'chat', 'file', 'artifact', 'work', 'research', 'schedule', 'browser-task', 'settings',
          'code-session'
        )
        and target_id is not null
        and length(target_id) between 1 and 128
      )
    );

commit;
