-- =============================================================================
-- Migration 0287: a bank transfer becomes a payment by being recorded, once
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : enterprise invoices settle by ACH or wire, which no provider
--          webhook announces. The only path to "this invoice is paid" was an
--          operator editing the amount paid on the invoice row from a bank
--          screenshot, leaving no record of who decided it, against which
--          remittance, or whether the same transfer had already been applied.
--
-- Two steps: a workspace reports the transfer it sent, and finance reconciles
--          it against the bank. Only a reconciled row counts against the
--          invoice, so a customer cannot settle its own invoice by asserting
--          it paid. The insert policy forbids app_rls from writing the
--          reconciliation columns at all, which is what makes that structural
--          rather than a rule in the service.
--
-- Shape  : one row per remittance. The unique constraint on
--          (stripe_invoice_id, remittance_reference) is the idempotency key:
--          re-submitting the same bank reference writes nothing a second time,
--          so a double-clicked operator form cannot pay an invoice twice.
--
-- Amounts: whole cents, positive, and checked against what is outstanding in
--          code before the insert. A reversal is its own concern and is not a
--          negative row here; nothing in this table is ever updated or deleted.
--
-- Depends: 0163 (organization_billing_invoices), 0076 (organizations)
-- =============================================================================

begin;

create table if not exists public.enterprise_offline_payment_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_invoice_id text not null
    references public.organization_billing_invoices(stripe_invoice_id) on delete cascade,
  method text not null
    check (method = any (array['ach_credit_transfer', 'wire', 'check'])),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency = lower(currency) and char_length(currency) = 3),
  remittance_reference text not null
    check (char_length(btrim(remittance_reference)) between 1 and 200),
  received_on date not null,
  reported_by text not null,
  reconciled_at timestamptz,
  reconciled_by text,
  note text,
  created_at timestamptz not null default now(),
  constraint enterprise_offline_payment_records_reconciliation_paired
    check ((reconciled_at is null) = (reconciled_by is null)),
  constraint enterprise_offline_payment_records_remittance_unique
    unique (stripe_invoice_id, remittance_reference)
);

create index if not exists idx_enterprise_offline_payments_organization
  on public.enterprise_offline_payment_records (organization_id, created_at desc);

alter table public.enterprise_offline_payment_records enable row level security;
alter table public.enterprise_offline_payment_records force row level security;

drop policy if exists enterprise_offline_payment_records_admin_read
  on public.enterprise_offline_payment_records;
create policy enterprise_offline_payment_records_admin_read
  on public.enterprise_offline_payment_records for select
  using (public.app_has_org_permission(organization_id, 'billing.read'));

drop policy if exists enterprise_offline_payment_records_admin_report
  on public.enterprise_offline_payment_records;
create policy enterprise_offline_payment_records_admin_report
  on public.enterprise_offline_payment_records
  for insert to app_rls
  with check (
    public.app_has_org_permission(organization_id, 'billing.contracts.manage')
    and reconciled_at is null
    and reconciled_by is null
  );

grant select, insert on public.enterprise_offline_payment_records to app_rls;

comment on table public.enterprise_offline_payment_records is
  'Bank transfers reported against an enterprise invoice. Insert only: a correction is a new remittance, never an edit to one already recorded.';
comment on column public.enterprise_offline_payment_records.reconciled_at is
  'When finance matched this remittance to the bank. NULL means reported but not reconciled, and an unreconciled report reduces nothing.';
comment on column public.enterprise_offline_payment_records.remittance_reference is
  'The bank reference the customer sent the money under. With the invoice id it is the idempotency key, so one transfer is applied once.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. The same remittance cannot be applied twice:
-- --    INSERT the same (stripe_invoice_id, remittance_reference) pair twice.
-- --    EXPECT: unique violation (enterprise_offline_payment_records_remittance_unique).
--
-- -- 2. A zero or negative transfer is refused:
-- --    INSERT with amount_cents = 0.
-- --    EXPECT: check violation.
--
-- -- 3. A member of another workspace reads nothing:
-- --    SET app.current_user_id to a member of another organization, then SELECT.
-- --    EXPECT: 0 rows.
--
-- -- 4. A workspace cannot report a transfer as already reconciled:
-- --    As app_rls, INSERT with reconciled_at = now() and reconciled_by = 'me'.
-- --    EXPECT: new row violates row-level security policy.
--
-- -- 5. A workspace cannot edit or delete a report it made:
-- --    As app_rls, UPDATE or DELETE any row.
-- --    EXPECT: permission denied.
