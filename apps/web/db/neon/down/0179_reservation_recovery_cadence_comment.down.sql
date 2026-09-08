-- Reversal of 0179 : restore migration 0056's description of the recovery
-- sweep.
--
-- WHAT THIS COSTS: the database goes back to claiming a per-minute caller that
-- has never existed. No behaviour changes; only the comment a reader sees.

begin;

comment on function public.recover_stale_managed_usage_requests(integer) is
  'Cron-only recovery. It never calls a provider and never takes over a lease. Missing durable provider success means the customer is refunded.';

delete from public.schema_migrations
  where filename = '0179_reservation_recovery_cadence_comment.sql';

commit;
