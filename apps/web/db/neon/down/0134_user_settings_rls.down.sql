-- Reversal of 0134 — remove row-level security from public.user_settings.
--
-- WHAT THIS COSTS: every user's synced settings become readable and writable by
-- any query that reaches the table without a user predicate, exactly as before
-- 0134. No row is deleted or changed. Only run this if the policy is breaking
-- a legitimate reader, and fix that reader rather than leaving this off.

begin;

drop policy if exists user_settings_user_isolation on public.user_settings;

alter table public.user_settings no force row level security;

alter table public.user_settings disable row level security;

delete from public.schema_migrations
 where filename = '0134_user_settings_rls.sql';

commit;
