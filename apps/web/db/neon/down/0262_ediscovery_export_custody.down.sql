-- Reversal of 0262 : drops the eDiscovery chain of custody.
--
-- WHAT THIS COSTS: every custody record is destroyed, so no export made while
-- 0262 was applied can be shown to be complete or unaltered, and the hash chain
-- cannot be rebuilt from anything else. Export keeps working and keeps writing
-- its enterprise_audit_events line, which says who exported and when and
-- nothing about what came out. Take a copy of the table before running this if
-- any export in it is still relevant to a live matter.

begin;

drop trigger if exists ediscovery_exports_append_only on public.ediscovery_exports;
drop table if exists public.ediscovery_exports;
drop function if exists public.ediscovery_exports_are_append_only();

delete from public.schema_migrations
 where filename = '0262_ediscovery_export_custody.sql';

commit;
