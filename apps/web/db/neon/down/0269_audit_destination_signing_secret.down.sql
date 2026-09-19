-- Reversal of 0269: removes the decryptable audit-stream signing key.
--
-- WHAT THIS COSTS: every configured SIEM destination becomes unable to verify
-- new deliveries until its secret is rotated after 0269 is applied again.

begin;

alter table public.organization_audit_destinations
  drop column if exists secret_ciphertext;

comment on column public.organization_audit_destinations.secret_hash is
  'SHA-256 of the signing secret. The raw value is returned once on creation and never again.';

delete from public.schema_migrations
 where filename = '0269_audit_destination_signing_secret.sql';

commit;
