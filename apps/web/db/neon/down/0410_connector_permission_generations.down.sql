-- Reversal of 0410: stop binding remembered connector approvals to a
-- permission generation.
--
-- WHAT THIS COSTS: every connector permission change, every disconnect and
-- every remembered approval reads or writes this table, so the code built on
-- 0410 must be rolled back first or permission settings, disconnects and
-- "allow for this conversation" all fail. After this runs, an approval card
-- reviewed before a reset to Ask can again be saved after it and turn that
-- Ask back into Allow. The counters themselves carry no customer content.

begin;

drop policy if exists connector_permission_generations_owner
  on public.connector_permission_generations;

drop trigger if exists set_connector_permission_generations_updated_at
  on public.connector_permission_generations;

drop table if exists public.connector_permission_generations;

delete from public.schema_migrations
 where filename = '0410_connector_permission_generations.sql';

commit;
