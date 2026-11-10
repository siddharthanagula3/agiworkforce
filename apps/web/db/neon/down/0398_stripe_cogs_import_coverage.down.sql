-- Reversal of 0398: forget how far the Stripe cost import is complete.
--
-- WHAT THIS COSTS: the reconcile-credits cron reads and writes this table, so
-- the code that claims and advances import coverage must be rolled back first
-- or every daily run fails its cost import. The import goes back to reading
-- only the three days before each run, and any range a failed run had kept for
-- retry is no longer retried. Ledger rows already imported are untouched.

begin;

drop table if exists public.stripe_cogs_import_coverage;

delete from public.schema_migrations
 where filename = '0398_stripe_cogs_import_coverage.sql';

commit;
