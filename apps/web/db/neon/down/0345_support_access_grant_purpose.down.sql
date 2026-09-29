-- Reversal of 0345 : break-glass grants no longer name a purpose.
--
-- WHAT THIS COSTS: the application can no longer tell a security, abuse, legal
-- or customer consent grant from an ordinary support grant, so a release that
-- withholds Google user data by purpose fails to read grants.

begin;

alter table public.support_access_grants
  drop constraint if exists support_access_grants_purpose_is_known;

alter table public.support_access_grants drop column if exists purpose;

delete from public.schema_migrations
 where filename = '0345_support_access_grant_purpose.sql';

commit;
