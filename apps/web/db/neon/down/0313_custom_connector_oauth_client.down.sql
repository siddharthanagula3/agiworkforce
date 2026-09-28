-- Reversal of 0313 : custom connectors go back to a fixed access token only.
--
-- WHAT THIS COSTS: every OAuth client a user supplied for a custom connector
-- is dropped, and the OAuth grants those connectors signed in with are
-- deleted, so each such connector stops working until it is removed and added
-- again with an access token. Connectors added with a token are untouched.

begin;

delete from public.connector_oauth_grants
 where connector_id like 'custom-%';

delete from public.connector_oauth_authorizations
 where connector_id like 'custom-%';

alter table public.user_custom_connectors
  drop constraint if exists user_custom_connectors_oauth_client_check,
  drop column if exists oauth_client_secret_enc,
  drop column if exists oauth_client_id,
  drop column if exists sign_in_required;

delete from public.schema_migrations
 where filename = '0313_custom_connector_oauth_client.sql';

commit;
