-- Reversal of 0220, drop customer-managed keys and the region pin.
--
-- Dropping organization_encryption_keys discards the WRAPPED data keys, which
-- makes anything sealed under a customer key unreadable. Nothing is sealed under
-- one at the time this reverses: the association exists but no ciphertext column
-- has been moved onto it, so the loss is the association itself. If that stops
-- being true, re-wrap onto the platform ring BEFORE running this.
--
-- The region columns go with it. Every workspace is in the home region, so
-- dropping the pin changes where nothing lives.

begin;

alter table public.organizations
  drop column if exists data_region_requested_at,
  drop column if exists data_region_requested,
  drop column if exists data_region;

drop policy if exists organization_encryption_keys_admin_read
  on public.organization_encryption_keys;

drop trigger if exists set_organization_encryption_keys_updated_at
  on public.organization_encryption_keys;

drop table if exists public.organization_encryption_keys;

delete from public.schema_migrations
 where filename = '0220_customer_managed_keys_and_data_region.sql';

commit;
