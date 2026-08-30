-- Reversal of 0153 — take public.notifications back out of row level security.
--
-- WHAT THIS COSTS: the table returns to having no isolation of any kind. It
-- keeps a user_id and its rows, but nothing in the database restricts who can
-- read them, and no application code polices it either — that was the state
-- this migration was written to end. Only run this if 0153 itself is the
-- problem; no data is lost either way.

begin;

drop policy if exists notifications_user_isolation on public.notifications;
alter table public.notifications no force row level security;
alter table public.notifications disable row level security;

delete from public.schema_migrations
 where filename = '0153_notifications_row_level_security.sql';

commit;
