-- =============================================================================
-- Migration 0400: a pending overage report keeps its billing destination
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a pending overage report (0367) stored its period, amount,
--          identifier and time, but not the Stripe customer or overage price
--          it was claimed for. The retry read both from the contract as it is
--          now, so a subscription change between the claim and the retry sent
--          the earlier usage to a different customer or meter.
--
-- Shape  : organization_billing_contracts gains the customer and the overage
--          price a pending report was claimed for. Both are written with the
--          claim, cleared with it, and a retry sends to them instead of the
--          contract's current values. They are set together, and only while a
--          report is pending.
--
-- Empty  : rows have no pending report or one claimed before this migration;
--          both columns stay null and a retry of such a report falls back to
--          the contract's current customer and price, as before.
--
-- Access : no policy or grant changes; the table keeps its existing RLS.
--
-- Depends: 0163 (organization_billing_contracts), 0367 (pending overage report)
-- =============================================================================

begin;

alter table public.organization_billing_contracts
  add column if not exists overage_pending_customer_id text,
  add column if not exists overage_pending_price_id text;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_overage_pending_destination;
alter table public.organization_billing_contracts
  add constraint organization_billing_contracts_overage_pending_destination check (
    (overage_pending_customer_id is null) = (overage_pending_price_id is null)
    and (overage_pending_identifier is not null or overage_pending_customer_id is null)
  );

comment on column public.organization_billing_contracts.overage_pending_customer_id is
  'Stripe customer the pending overage report was claimed for. A retry sends to it, not to the contract''s current customer. Null with no pending report, or for one claimed before 0400.';
comment on column public.organization_billing_contracts.overage_pending_price_id is
  'Overage price whose meter the pending overage report was claimed for. A retry sends to that meter, not the contract''s current price. Null with no pending report, or for one claimed before 0400.';

commit;
