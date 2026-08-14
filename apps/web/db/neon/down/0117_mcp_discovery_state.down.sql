-- Down for 0117 — persisted OAuth discovery state.
--
-- Dropping the column loses nothing durable: rows in
-- `connector_oauth_authorizations` are in-flight authorizations with a 10-minute
-- TTL, not settled credentials. Any flow open at the moment of the reversal
-- fails its callback and the user starts again.
--
-- Reverting this WITHOUT also reverting the application code re-breaks the
-- callback leg for every discovered connector, because `auth()` refuses to
-- redeem an authorization code when it cannot read the issuer recorded at the
-- start of the flow. Revert the code first.

BEGIN;

alter table public.connector_oauth_authorizations
  drop column if exists discovery_state;

delete from public.schema_migrations where filename = '0117_mcp_discovery_state.sql';

COMMIT;
