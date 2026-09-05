-- Reversal of 0171 — take public.github_installations back out of row level
-- security.
--
-- WHAT THIS COSTS: the table returns to having no database-enforced
-- isolation. GET/DELETE /api/github/installations, api/connectors/route.ts
-- and the connector revoke executor keep working exactly as they did before
-- this migration, because they already filter by user_id in SQL; only the
-- backstop that catches a future statement forgetting that filter is gone.

begin;

drop policy if exists github_installations_user_isolation on public.github_installations;
alter table public.github_installations no force row level security;
alter table public.github_installations disable row level security;

delete from public.schema_migrations
 where filename = '0171_github_installations_row_level_security.sql';

commit;
