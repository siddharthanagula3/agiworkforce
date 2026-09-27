-- Reversal of 0312 : removes the refresh lease from connector OAuth grants.
--
-- WHAT THIS COSTS: connector token refresh stops being single-flight, so two
-- instances refreshing one grant at the same moment can present the same
-- rotating refresh token twice and the provider may revoke the grant. Stored
-- tokens and grants are untouched; a lease held at the moment of reversal is
-- simply forgotten.

begin;

alter table public.connector_oauth_grants
  drop column if exists refresh_lease_expires_at,
  drop column if exists refresh_lease_id;

delete from public.schema_migrations
 where filename = '0312_connector_grant_refresh_lease.sql';

commit;
