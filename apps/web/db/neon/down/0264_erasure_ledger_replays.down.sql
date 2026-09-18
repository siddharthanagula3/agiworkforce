-- Reversal of 0264 : drops the post-restore erasure replay evidence.
--
-- WHAT THIS COSTS: every record of a replay is destroyed, so no past restore
-- can be shown to have re-armed the tombstones the restore rolled back. The
-- replay itself keeps working, because the ledger it reads lives in the object
-- backup bucket rather than here, but it stops leaving a trace. Copy the table
-- before running this if any restore in it is still in an audit window.

begin;

drop table if exists public.erasure_ledger_replays;

delete from public.schema_migrations
 where filename = '0264_erasure_ledger_replays.sql';

commit;
