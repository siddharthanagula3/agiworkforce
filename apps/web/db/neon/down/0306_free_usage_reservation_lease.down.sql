-- Reversal of 0306 : removes the lease and serving route from Free usage
-- reservations.
--
-- WHAT THIS COSTS: the reservation sweep can no longer tell when a Free turn's
-- lease ended, so a turn that dies without settling holds the user's smallest
-- Free window until the window ages out, and released reservations lose the
-- provider and model their COGS rows were attributed to. Settled reservations
-- and their costs are untouched.

begin;

alter table public.free_daily_usage_reservations
  drop column if exists model,
  drop column if exists provider,
  drop column if exists lease_expires_at;

delete from public.schema_migrations
 where filename = '0306_free_usage_reservation_lease.sql';

commit;
