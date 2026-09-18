-- Reversal of 0251 : remove the Login and Search outcome instruments.
--
-- WHAT THIS COSTS: every recorded authentication attempt is gone, and with it
-- the only record that separates an unreachable identity provider from a
-- rejected credential. Every search outcome recorded so far is gone too, so the
-- Search service level goes back to being declared and not measured. The search
-- rows themselves (query, result_count) are untouched.

BEGIN;

DROP INDEX IF EXISTS public.idx_search_history_outcome;

ALTER TABLE IF EXISTS public.search_history
  DROP CONSTRAINT IF EXISTS search_history_outcome_values;

ALTER TABLE IF EXISTS public.search_history
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS duration_ms;

DROP TABLE IF EXISTS public.authentication_attempts;

DELETE FROM public.schema_migrations
 WHERE filename = '0251_authentication_and_search_outcomes.sql';

COMMIT;
