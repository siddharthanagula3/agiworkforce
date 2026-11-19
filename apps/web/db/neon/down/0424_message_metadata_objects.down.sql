-- Reversal of 0424: forget that message and project metadata was repaired.
--
-- WHAT THIS COSTS: nothing is put back. 0424 changed no schema; it rewrote
-- metadata that was not an object (JSON null, or the array a merge built onto
-- it) into the object it was meant to be. Writing those values back would break
-- chat sync for every account that held one again, and the values are not kept
-- anywhere to restore. This only retracts the ledger row, so a later apply runs
-- the repair again, which finds nothing to change once the writers that made
-- such rows are deployed.

begin;

delete from public.schema_migrations
 where filename = '0424_message_metadata_objects.sql';

commit;
