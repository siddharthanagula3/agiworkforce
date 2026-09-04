-- Reversal of 0163, remove the enterprise billing contract and invoice ledger.
--
-- Every contract record and every mirrored invoice row is dropped. Stripe
-- remains the billing system of record, so nothing is lost that cannot be
-- re-mirrored, but the collection stage history and procurement references
-- stored here disappear. Export both tables before running this anywhere that
-- matters.

begin;

drop policy if exists organization_billing_invoices_admin_read
  on public.organization_billing_invoices;
drop trigger if exists set_organization_billing_invoices_updated_at
  on public.organization_billing_invoices;
drop index if exists public.idx_organization_billing_invoices_organization;
drop table if exists public.organization_billing_invoices;

drop policy if exists organization_billing_contracts_admin_read
  on public.organization_billing_contracts;
drop trigger if exists set_organization_billing_contracts_updated_at
  on public.organization_billing_contracts;
drop index if exists public.idx_organization_billing_contracts_open_invoice;
drop index if exists public.idx_organization_billing_contracts_subscription;
drop table if exists public.organization_billing_contracts;

delete from public.schema_migrations
 where filename = '0163_enterprise_billing_contracts.sql';

commit;
