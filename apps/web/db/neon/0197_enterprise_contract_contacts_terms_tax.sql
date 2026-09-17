-- 0197 : record who to bill, who buys, on what payment terms and under which
--        tax status, on the enterprise contract itself.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- An enterprise contract named a legal entity and a PO number and nothing
-- about the people behind them, so an invoice question had nobody on record to
-- go to. Payment terms lived only on individual Stripe invoices: an invoice
-- that Stripe charges automatically carries no due date, and collection could
-- never date it. Tax exemption was decided in Stripe and invisible here.
--
-- Contacts and terms are authored where the rest of the negotiated contract
-- already is, the Stripe subscription metadata, and synced by the webhook.
-- Tax status mirrors the Stripe customer, which is what Stripe Tax applies.

begin;

alter table public.organization_billing_contracts
  add column if not exists billing_contact_name text
    check (billing_contact_name is null or length(btrim(billing_contact_name)) between 1 and 200),
  add column if not exists billing_contact_email text
    check (billing_contact_email is null or billing_contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add column if not exists procurement_contact_name text
    check (procurement_contact_name is null or length(btrim(procurement_contact_name)) between 1 and 200),
  add column if not exists procurement_contact_email text
    check (procurement_contact_email is null or procurement_contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add column if not exists payment_terms_days integer
    check (payment_terms_days is null or payment_terms_days between 0 and 180),
  add column if not exists tax_exempt_status text not null default 'none'
    check (tax_exempt_status in ('none', 'exempt', 'reverse'));

comment on column public.organization_billing_contracts.payment_terms_days is
  'Negotiated NET terms in days. Dates an open invoice that Stripe issued without a due date, from its finalization. Null when the contract states none.';
comment on column public.organization_billing_contracts.tax_exempt_status is
  'Mirror of the Stripe customer tax_exempt field: none, exempt, or reverse (reverse charge). Stripe Tax applies it; this copy is for display and audit.';

commit;
