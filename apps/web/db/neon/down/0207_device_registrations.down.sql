-- Reversal of 0207 : remove the device registry.
--
-- WHAT THIS COSTS: the devices panel loses OS, architecture, version,
-- capabilities, workspace and presence for every surface, and rename or revoke
-- of those rows. Credentials are untouched: a device keeps signing in, and its
-- next heartbeat fails until 0207 is applied again.

begin;

drop policy if exists device_registrations_user_isolation on public.device_registrations;
drop index if exists public.idx_device_registrations_organization;
drop index if exists public.idx_device_registrations_user_seen;
drop table if exists public.device_registrations;

delete from public.schema_migrations
 where filename = '0207_device_registrations.sql';

commit;
