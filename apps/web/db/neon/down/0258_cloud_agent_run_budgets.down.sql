-- Reversal of 0258 : drops the per-run safety envelope for Managed Cloud runs.
--
-- WHAT THIS COSTS: every live run loses its spend, tool-call and wall-clock cap
-- the moment this runs, so a looping or runaway run is again only discovered
-- after it settles. The record of which cap stopped which run is deleted too.

BEGIN;

DROP TABLE IF EXISTS public.cloud_agent_run_budgets;

DELETE FROM public.schema_migrations
 WHERE filename = '0258_cloud_agent_run_budgets.sql';

COMMIT;
