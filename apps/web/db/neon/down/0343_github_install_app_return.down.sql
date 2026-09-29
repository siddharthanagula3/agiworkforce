-- Reversal of 0343 : GitHub app installs started on the phone no longer finish
-- on it.
--
-- WHAT THIS COSTS: Connect GitHub from the phone lands on the web login again
-- and the installation never links to the account.

begin;

drop table if exists public.github_install_authorizations;

delete from public.schema_migrations
 where filename = '0343_github_install_app_return.sql';

commit;
