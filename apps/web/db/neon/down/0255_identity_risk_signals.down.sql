-- Reversal of 0255 : drops the risk history and the compromise-response record.
--
-- WHAT THIS COSTS: every risk observation is gone, so impossible travel and
-- new-location detection start from nothing and the next sign-in from anywhere
-- is unremarkable. Open compromise responses are gone too: an account that was
-- told to finish a password reset loses the record that said so.

BEGIN;

DROP TABLE IF EXISTS public.account_compromise_responses;
DROP TABLE IF EXISTS public.identity_risk_observations;

DELETE FROM public.schema_migrations
 WHERE filename = '0255_identity_risk_signals.sql';

COMMIT;
