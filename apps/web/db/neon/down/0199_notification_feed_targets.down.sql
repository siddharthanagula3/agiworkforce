-- Reversal of 0199 : drop the notification category, target and dedupe columns.
--
-- WHAT THIS COSTS: every feed row loses what it was about and where it opens,
-- and a notifier that runs twice for one event writes two rows again. Titles,
-- messages and read flags are kept.

begin;

drop index if exists public.notifications_user_dedupe_key_idx;

alter table public.notifications
  drop constraint if exists notifications_dedupe_key_length_check,
  drop constraint if exists notifications_target_check,
  drop constraint if exists notifications_category_check;

alter table public.notifications
  drop column if exists read_at,
  drop column if exists dedupe_key,
  drop column if exists target_id,
  drop column if exists target_kind,
  drop column if exists category;

delete from public.schema_migrations
 where filename = '0199_notification_feed_targets.sql';

commit;
