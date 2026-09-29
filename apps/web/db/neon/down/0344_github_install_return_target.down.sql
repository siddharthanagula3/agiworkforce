-- Reversal of 0344 : phone GitHub installs return on the custom scheme again.
--
-- WHAT THIS COSTS: on Android the install response goes back over
-- agiworkforce://, which another installed app can register and intercept.

begin;

alter table public.github_install_authorizations drop column if exists return_target;

delete from public.schema_migrations
 where filename = '0344_github_install_return_target.sql';

commit;
