-- Reversal of 0206 : remove workspace API keys.
--
-- WHAT THIS COSTS: every workspace API key stops authenticating at once, so a
-- SIEM or compliance integration using one loses access to the audit trail and
-- eDiscovery export until it is given a personal credential instead.

begin;

drop policy if exists organization_admin_api_keys_identity_read
  on public.organization_admin_api_keys;
drop table if exists public.organization_admin_api_keys;

delete from public.schema_migrations
 where filename = '0206_organization_admin_api_keys.sql';

commit;
