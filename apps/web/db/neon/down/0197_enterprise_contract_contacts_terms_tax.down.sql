-- Reversal of 0197 : forget contract contacts, payment terms and tax status.
--
-- WHAT THIS COSTS: billing and procurement contacts are lost until the next
-- subscription webhook would have re-synced them, and an open invoice that
-- Stripe issued without a due date can no longer be dated for collection.
-- Stripe keeps every source value.

begin;

alter table public.organization_billing_contracts
  drop column if exists tax_exempt_status,
  drop column if exists payment_terms_days,
  drop column if exists procurement_contact_email,
  drop column if exists procurement_contact_name,
  drop column if exists billing_contact_email,
  drop column if exists billing_contact_name;

delete from public.schema_migrations
 where filename = '0197_enterprise_contract_contacts_terms_tax.sql';

commit;
