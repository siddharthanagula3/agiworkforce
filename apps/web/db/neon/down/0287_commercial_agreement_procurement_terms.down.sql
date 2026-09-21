-- Reversal of the enterprise invoice issuance terms.
--
-- COST, read this before running it: the negotiated seat rate, the invoice
-- recipients and the agreed currency are deleted from every agreement, and
-- whether a customer requires a purchase order number is forgotten. Invoicing
-- falls back to whatever the Stripe subscription carries, which is the
-- condition this migration was written to end.

begin;

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_expiry_grace_check;
alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_seat_rate_check;
alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_billing_currency_check;

alter table public.organization_commercial_agreements
  drop column if exists purchase_order_required,
  drop column if exists invoice_recipient_emails,
  drop column if exists billing_currency,
  drop column if exists seat_unit_price_cents,
  drop column if exists expiry_grace_days;

-- destructive: removes this migration's ledger row so the runner can apply it again.
delete from public.schema_migrations
 where filename = '0287_commercial_agreement_procurement_terms.sql';

commit;
