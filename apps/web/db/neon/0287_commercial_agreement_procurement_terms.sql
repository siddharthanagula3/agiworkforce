-- =============================================================================
-- Migration 0286: the terms an enterprise invoice cannot be issued without
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : four things a procurement department insists on had nowhere to
--          live. Whether a purchase order number is REQUIRED (as opposed to
--          merely recorded) was not stored, so an invoice went out blank where
--          the PO belongs and was rejected by the customer's AP system. The
--          people an invoice is sent to were one nullable billing contact,
--          which in practice meant the workspace owner. The negotiated seat
--          rate lived only in the Stripe price the subscription happened to
--          carry, so the signed rate could not be checked against what was
--          billed. Currency was read off the invoice rather than agreed.
--
-- Grace  : expiry_grace_days is a negotiated term and defaults to 0, so an
--          agreement grants nothing past its end date unless someone agreed it
--          would. Anything else would extend every existing contract silently.
--
-- Rate   : seat_unit_price_cents is nullable and has no default. It is the
--          rate this customer signed, not a published price, and a contract
--          that has not agreed one must fail invoice issuance rather than
--          inherit a number from anywhere.
--
-- Depends: 0228 (organization_commercial_agreements)
-- =============================================================================

begin;

alter table public.organization_commercial_agreements
  add column if not exists purchase_order_required boolean not null default false,
  add column if not exists invoice_recipient_emails text[] not null default '{}'::text[],
  add column if not exists billing_currency text not null default 'usd',
  add column if not exists seat_unit_price_cents bigint,
  add column if not exists expiry_grace_days integer not null default 0;

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_billing_currency_check;
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_billing_currency_check
  check (billing_currency = lower(billing_currency) and char_length(billing_currency) = 3);

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_seat_rate_check;
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_seat_rate_check
  check (seat_unit_price_cents is null or seat_unit_price_cents >= 0);

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_expiry_grace_check;
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_expiry_grace_check
  check (expiry_grace_days >= 0 and expiry_grace_days <= 180);

comment on column public.organization_commercial_agreements.purchase_order_required is
  'Whether this customer refuses an invoice with no PO number on it. Enforced when the invoice is created, not when it is displayed.';
comment on column public.organization_commercial_agreements.invoice_recipient_emails is
  'Who receives the invoice. Separate from the workspace owner on purpose: accounts payable is rarely a product admin.';
comment on column public.organization_commercial_agreements.seat_unit_price_cents is
  'The negotiated per-seat rate for one billing period, in whole cents. NULL means no rate was agreed and no invoice can be issued.';
comment on column public.organization_commercial_agreements.expiry_grace_days is
  'Whole days past contract_term_end this agreement keeps granting. Zero unless it was negotiated.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Currency is stored one way only:
-- --    UPDATE public.organization_commercial_agreements SET billing_currency = 'USD'
-- --     WHERE id = '<id>';
-- --    EXPECT: check violation (organization_commercial_agreements_billing_currency_check).
--
-- -- 2. A grace longer than the ceiling is refused:
-- --    UPDATE public.organization_commercial_agreements SET expiry_grace_days = 181
-- --     WHERE id = '<id>';
-- --    EXPECT: check violation (organization_commercial_agreements_expiry_grace_check).
--
-- -- 3. Recipients round-trip as an array:
-- --    UPDATE public.organization_commercial_agreements
-- --       SET invoice_recipient_emails = array['ap@example.com'] WHERE id = '<id>';
-- --    EXPECT: 1 row updated.
