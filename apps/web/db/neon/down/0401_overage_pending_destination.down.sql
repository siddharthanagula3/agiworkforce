-- Reversal of 0401: forget the destination a pending overage report was
-- claimed for.
--
-- WHAT THIS COSTS: the usage reporter reads and writes these columns, so the
-- code that stores and replays the pending destination must be rolled back
-- first or every overage report fails. A pending report retried afterwards is
-- sent to the contract's current customer and price again, which may not be
-- the one it was claimed for if the subscription changed in between.

begin;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_overage_pending_destination,
  drop column if exists overage_pending_price_id,
  drop column if exists overage_pending_customer_id;

delete from public.schema_migrations
 where filename = '0401_overage_pending_destination.sql';

commit;
