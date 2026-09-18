-- Reversal of 0256 : drops scoped admin delegation.
--
-- WHAT THIS COSTS: every live delegation is gone, so anyone who held billing or
-- identity only through one loses it the moment this runs, and the record of who
-- granted what, and when it was meant to lapse, is deleted with it.

BEGIN;

DROP TABLE IF EXISTS public.organization_admin_delegations;

DELETE FROM public.schema_migrations
 WHERE filename = '0256_organization_admin_delegations.sql';

COMMIT;
