-- Reversal of 0245, drop admin write idempotency and service principals.
--
-- COST, read this before running it: every workspace API key loses its
-- service-principal identity, so an automation's actions are attributed to the
-- administrator who minted its key again, and a disabled principal no longer
-- stops the keys issued to it. In-flight idempotency records are destroyed, so
-- a client retrying a write that was accepted in the last 24 hours performs it
-- a second time instead of replaying the first response.

begin;

drop table if exists public.admin_request_idempotency;

drop index if exists public.idx_organization_admin_api_keys_principal;

alter table public.organization_admin_api_keys
  drop column if exists service_principal_id;

drop table if exists public.organization_service_principals;

delete from public.schema_migrations
 where filename = '0245_admin_write_idempotency_and_service_principals.sql';

commit;
