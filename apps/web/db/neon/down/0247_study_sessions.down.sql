-- Reversal of 0247, drop Study mode sessions.
--
-- COST, read this before running it: every study session is deleted. The
-- conversations and their messages survive untouched, so nothing a user wrote
-- is lost, but what each conversation was studying, in which mode and at what
-- level is gone, and the Study history list becomes empty.

begin;

drop table if exists public.study_sessions;

delete from public.schema_migrations
 where filename = '0247_study_sessions.sql';

commit;
