-- 0163 the enterprise billing contract and invoice ledger.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- Enterprise customers are provisioned at signature from a Stripe subscription
-- that collects by invoice. Entitlement still comes from Stripe billing
-- objects (a price under the Enterprise product), never from metadata. This
-- migration adds the contract record the product keeps beside that
-- subscription: the procurement reference, the term, the cadence, the seat
-- commitment, the included usage allowance, the overage price and negotiated
-- blocks, and the collection stage a daily sweep derives from the oldest open
-- invoice. It also adds an invoice ledger kept for reconciliation, audit
-- history and billing-provider portability. Nothing here deletes customer
-- data on non-payment; the read_only stage is the strongest automated state.

begin;

create table if not exists public.organization_billing_contracts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_product_id text not null,
  stripe_price_id text,
  procurement_reference text,
  customer_legal_entity text,
  contract_term_start date,
  contract_term_end date,
  billing_cadence text not null default 'annual'
    check (billing_cadence in ('annual', 'quarterly')),
  committed_seats integer not null default 1
    check (committed_seats >= 1),
  included_usage_cents_per_period bigint not null default 0
    check (included_usage_cents_per_period >= 0),
  overage_stripe_price_id text,
  committed_usage_block_cents bigint not null default 0
    check (committed_usage_block_cents >= 0),
  minimum_annual_spend_cents bigint not null default 0
    check (minimum_annual_spend_cents >= 0),
  support_tier text,
  oldest_open_invoice_id text,
  oldest_open_invoice_due_at timestamptz,
  collection_stage text not null default 'current'
    check (collection_stage in ('current', 'past_due_30', 'past_due_60', 'past_due_90', 'read_only')),
  collection_stage_changed_at timestamptz,
  last_collection_notice_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  last_stripe_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_billing_contracts_subscription
  on public.organization_billing_contracts (stripe_subscription_id);
create index if not exists idx_organization_billing_contracts_open_invoice
  on public.organization_billing_contracts (oldest_open_invoice_due_at)
  where oldest_open_invoice_due_at is not null;

drop trigger if exists set_organization_billing_contracts_updated_at
  on public.organization_billing_contracts;
create trigger set_organization_billing_contracts_updated_at
  before update on public.organization_billing_contracts
  for each row execute function public.set_row_updated_at();

create table if not exists public.organization_billing_invoices (
  stripe_invoice_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_subscription_id text,
  invoice_number text,
  status text not null,
  collection_method text,
  amount_due_cents bigint not null default 0,
  amount_paid_cents bigint not null default 0,
  currency text not null,
  procurement_reference text,
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  last_stripe_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_billing_invoices_organization
  on public.organization_billing_invoices (organization_id, due_at);

drop trigger if exists set_organization_billing_invoices_updated_at
  on public.organization_billing_invoices;
create trigger set_organization_billing_invoices_updated_at
  before update on public.organization_billing_invoices
  for each row execute function public.set_row_updated_at();

alter table public.organization_billing_contracts enable row level security;
alter table public.organization_billing_contracts force row level security;
drop policy if exists organization_billing_contracts_admin_read
  on public.organization_billing_contracts;
create policy organization_billing_contracts_admin_read
  on public.organization_billing_contracts for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.organization_billing_invoices enable row level security;
alter table public.organization_billing_invoices force row level security;
drop policy if exists organization_billing_invoices_admin_read
  on public.organization_billing_invoices;
create policy organization_billing_invoices_admin_read
  on public.organization_billing_invoices for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

grant select on public.organization_billing_contracts to app_rls;
grant select on public.organization_billing_invoices to app_rls;

commit;
