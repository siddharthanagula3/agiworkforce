-- Reversal of 0330 : the desktop app can no longer finish a sign-in that was
-- made in the system browser.
--
-- WHAT THIS COSTS: grants waiting to be redeemed are deleted, so a sign-in in
-- progress has to start again. No account or session is touched.

begin;

drop policy if exists desktop_sign_in_grants_user_isolation on public.desktop_sign_in_grants;
alter table if exists public.desktop_sign_in_grants disable row level security;
drop index if exists public.idx_desktop_sign_in_grants_expiry;
drop index if exists public.idx_desktop_sign_in_grants_user;
drop table if exists public.desktop_sign_in_grants;

delete from public.schema_migrations where filename = '0330_desktop_sign_in_grants.sql';

commit;
