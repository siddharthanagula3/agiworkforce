-- Reversal of 0254, drop notebook run provenance.
--
-- COST, read this before running it: every recorded notebook run is deleted, so
-- no past result can be traced to the code and the kernel state that produced
-- it. The sessions and their files survive untouched; only the history goes.

begin;

drop table if exists public.notebook_runs;

delete from public.schema_migrations
 where filename = '0254_notebook_runs.sql';

commit;
