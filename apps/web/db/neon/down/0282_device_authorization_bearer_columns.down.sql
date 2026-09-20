-- Reversal of the device authorization bearer column removal.
--
-- COST, read this before running it: the two columns come back empty and
-- nullable, which is the state they were in. Nothing is restored because
-- nothing was stored: every writer wrote NULL. What comes back is the hazard,
-- two unencrypted text columns shaped to hold a bearer token on a table an
-- unauthenticated flow inserts into.

begin;

alter table public.device_authorization_codes
  add column if not exists access_token text,
  add column if not exists refresh_token text;

-- destructive: removes this migration's ledger row so the runner can apply it again.
delete from public.schema_migrations
 where filename = '0282_device_authorization_bearer_columns.sql';

commit;
