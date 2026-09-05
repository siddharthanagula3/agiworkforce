-- Reversal of 0172 — take public.content_reports back out of row level
-- security.
--
-- WHAT THIS COSTS: the table returns to having no database-enforced
-- isolation. Nothing live changes either way — every current caller already
-- runs on the owner connection, which bypasses RLS regardless — this only
-- removes the backstop for a future app_rls-scoped caller.

begin;

drop policy if exists content_reports_select_own on public.content_reports;
drop policy if exists content_reports_insert_own on public.content_reports;
alter table public.content_reports no force row level security;
alter table public.content_reports disable row level security;

delete from public.schema_migrations
 where filename = '0172_content_reports_row_level_security.sql';

commit;
