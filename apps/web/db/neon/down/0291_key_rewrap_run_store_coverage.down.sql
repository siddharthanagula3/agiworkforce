-- Reversal of the rewrap run store coverage column.
--
-- WHAT THIS COSTS: the record of which sealed stores each rewrap walked is
-- deleted. Runs already filed keep their counters, so nothing becomes
-- unreadable, but the retirement gate loses the only evidence that a run
-- covered every store and goes back to accepting a run over a subset.

BEGIN;

ALTER TABLE public.organization_key_rewrap_runs
  DROP CONSTRAINT IF EXISTS organization_key_rewrap_runs_complete_names_its_stores;

ALTER TABLE public.organization_key_rewrap_runs
  DROP COLUMN IF EXISTS covered_stores;

DELETE FROM public.schema_migrations
 WHERE filename = '0291_key_rewrap_run_store_coverage.sql';

COMMIT;
