-- Reversal of 0128 — drop the Stripe event-sequence watermark.
--
-- WHAT THIS COSTS: subscription writes lose their out-of-order guard, so a
-- retried Stripe event delivered late can overwrite a newer plan or status.
-- Re-running 0128 restores the column but not the watermarks, which rebuild
-- on the next event per subscription.

begin;

alter table if exists public.subscriptions
  drop column if exists last_stripe_event_at;

delete from public.schema_migrations where filename = '0128_stripe_event_ordering.sql';

commit;
