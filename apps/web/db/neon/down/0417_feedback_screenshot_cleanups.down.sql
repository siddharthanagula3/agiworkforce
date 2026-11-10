-- Reversal of 0417: forget the cleanup record of each feedback screenshot upload.
--
-- WHAT THIS COSTS: the feedback route, the media purge cron and account
-- erasure read and write this table, so that code must be rolled back first or
-- every report that carries a screenshot, the daily sweep and every account
-- erasure fails. Rows still pending are dropped with the table: the objects
-- they name stay in private storage with no record, unreachable by erasure,
-- and cannot be recovered from the database afterwards.

begin;

drop table if exists public.feedback_screenshot_cleanups;

delete from public.schema_migrations
 where filename = '0417_feedback_screenshot_cleanups.sql';

commit;
