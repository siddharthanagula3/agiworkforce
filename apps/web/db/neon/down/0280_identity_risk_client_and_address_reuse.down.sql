-- Reversal of 0278 : drops the client reference and the address-reuse index.
--
-- WHAT THIS COSTS: every stored browser reference is gone, so the new-browser
-- signal cannot fire again until each account has signed in once more from
-- each browser it uses. The cross-account failure count still answers, but
-- without its index it falls back to a sequential scan of the whole table.

BEGIN;

DROP INDEX IF EXISTS public.idx_identity_risk_observations_address_failures;

ALTER TABLE public.identity_risk_observations
  DROP COLUMN IF EXISTS user_agent_ref;

DELETE FROM public.schema_migrations
 WHERE filename = '0280_identity_risk_client_and_address_reuse.sql';

COMMIT;
