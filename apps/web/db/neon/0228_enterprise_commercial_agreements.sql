-- 0228 : the signed commercial agreement an enterprise contract is billed under.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0163 gave enterprise billing a contract row, but its terms were read out of
-- Stripe subscription metadata strings and written straight over the previous
-- values. Two things followed. Negotiated terms lived in an unschematized
-- metadata field that anyone with Stripe dashboard access could retype, and an
-- amendment destroyed the terms it replaced, so nobody could answer what a
-- customer had agreed to last quarter.
--
-- This table reverses the direction of truth. An Order Form is authored here,
-- signed, and versioned: an amendment is a new row at version n+1, the row it
-- replaces is marked superseded and keeps its values, and Stripe subscription
-- metadata is generated FROM the executed row rather than parsed into it. A
-- metadata value that disagrees with the agreement is a mismatch to be
-- reported, not a new term to be trusted.
--
-- organization_billing_contracts gains the link to the executed agreement and
-- the reason its activation is blocked when no signed order exists, which is
-- what lets billing operations see a workspace being invoiced with no signed
-- commercial basis instead of inferring it.
--
-- payment_method_policy mirrors ENTERPRISE_PAYMENT_METHOD_POLICIES in
-- apps/web/lib/services/enterprise-contracts/payment-methods.ts; a test asserts
-- the two agree.

begin;

create table if not exists public.organization_commercial_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'draft'
    check (status = any (array['draft', 'pending_signature', 'executed', 'superseded'])),
  order_form_reference text,
  signature_provider text
    check (signature_provider is null
           or signature_provider = any (array['docusign', 'manual_countersigned'])),
  signature_envelope_id text,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_email text,
  customer_legal_entity text not null check (char_length(customer_legal_entity) between 1 and 255),
  committed_seats integer not null check (committed_seats >= 1),
  billing_cadence text not null
    check (billing_cadence = any (array['annual', 'quarterly'])),
  contract_term_start date not null,
  contract_term_end date not null,
  payment_terms_days integer not null
    check (payment_terms_days >= 0 and payment_terms_days <= 180),
  payment_method_policy text not null
    check (payment_method_policy = any (array['invoice_ach_wire', 'invoice_ach_wire_card',
                                              'card_only'])),
  included_usage_cents_per_period bigint not null default 0
    check (included_usage_cents_per_period >= 0),
  committed_usage_block_cents bigint not null default 0
    check (committed_usage_block_cents >= 0),
  minimum_annual_spend_cents bigint not null default 0
    check (minimum_annual_spend_cents >= 0),
  overage_stripe_price_id text,
  support_tier text,
  procurement_reference text,
  billing_contact_name text,
  billing_contact_email text,
  procurement_contact_name text,
  procurement_contact_email text,
  tax_exempt_status text not null
    check (tax_exempt_status = any (array['none', 'exempt', 'reverse'])),
  amendment_reason text,
  authored_by text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint organization_commercial_agreements_version_unique
    unique (organization_id, version),
  constraint organization_commercial_agreements_term_ordered
    check (contract_term_end >= contract_term_start),
  constraint organization_commercial_agreements_execution_signed
    check (status <> 'executed' or (signed_at is not null and order_form_reference is not null))
);

create unique index if not exists idx_org_commercial_agreements_live
  on public.organization_commercial_agreements (organization_id)
  where superseded_at is null;

create index if not exists idx_org_commercial_agreements_envelope
  on public.organization_commercial_agreements (signature_envelope_id)
  where signature_envelope_id is not null;

alter table public.organization_commercial_agreements enable row level security;
alter table public.organization_commercial_agreements force row level security;

drop policy if exists organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements;
create policy organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

grant select on public.organization_commercial_agreements to app_rls;

alter table public.organization_billing_contracts
  add column if not exists commercial_agreement_id uuid
    references public.organization_commercial_agreements(id) on delete set null;
alter table public.organization_billing_contracts
  add column if not exists commercial_agreement_version integer;
alter table public.organization_billing_contracts
  add column if not exists signed_order_reference text;
alter table public.organization_billing_contracts
  add column if not exists signed_order_signed_at timestamptz;
alter table public.organization_billing_contracts
  add column if not exists activation_blocked_reason text;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_activation_blocked_reason_check;
alter table public.organization_billing_contracts
  add constraint organization_billing_contracts_activation_blocked_reason_check
  check (activation_blocked_reason is null
         or activation_blocked_reason = any (array['missing_signed_order',
                                                   'agreement_terms_mismatch']));

create index if not exists idx_organization_billing_contracts_unsigned
  on public.organization_billing_contracts (activation_blocked_reason)
  where activation_blocked_reason is not null;

commit;
