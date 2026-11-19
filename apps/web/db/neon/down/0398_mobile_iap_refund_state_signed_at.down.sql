-- Reversal of 0398: forget the signed time of each receipt's refund state.
--
-- WHAT THIS COSTS: the notification service reads this column, so the code
-- that orders refund and reversal notices must be rolled back first or every
-- store notification fails. Refund-state notices are applied in arrival order
-- again, and a late refund can undo a reversal that arrived before it.

begin;

alter table public.mobile_iap_transactions
  drop column if exists refund_state_signed_at;

delete from public.schema_migrations
 where filename = '0398_mobile_iap_refund_state_signed_at.sql';

commit;
