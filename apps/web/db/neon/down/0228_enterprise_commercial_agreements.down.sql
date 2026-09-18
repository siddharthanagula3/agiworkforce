-- Reversal of 0228, drop the commercial agreement domain.
--
-- Every authored and signed Order Form version is discarded with the table, and
-- the billing contract goes back to carrying only what Stripe metadata said.
-- The signed-order gate disappears with the activation_blocked_reason column,
-- so an enterprise workspace can be invoiced again with no recorded signed
-- commercial basis.

begin;

drop index if exists public.idx_organization_billing_contracts_unsigned;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_activation_blocked_reason_check;

alter table public.organization_billing_contracts
  drop column if exists activation_blocked_reason;
alter table public.organization_billing_contracts
  drop column if exists signed_order_signed_at;
alter table public.organization_billing_contracts
  drop column if exists signed_order_reference;
alter table public.organization_billing_contracts
  drop column if exists commercial_agreement_version;
alter table public.organization_billing_contracts
  drop column if exists commercial_agreement_id;

drop policy if exists organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements;

alter table public.organization_commercial_agreements disable row level security;
alter table public.organization_commercial_agreements no force row level security;

drop index if exists public.idx_org_commercial_agreements_envelope;
drop index if exists public.idx_org_commercial_agreements_live;

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_execution_signed;
alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_term_ordered;
alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_version_unique;

drop table if exists public.organization_commercial_agreements;

delete from public.schema_migrations
 where filename = '0228_enterprise_commercial_agreements.sql';

commit;
