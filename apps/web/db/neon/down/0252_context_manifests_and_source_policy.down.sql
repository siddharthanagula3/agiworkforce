-- Reversal of 0252, drop context manifests and the two context policy columns.
--
-- COST, read this before running it: every recorded manifest is deleted, so no
-- past turn can be explained after the fact any more. Live chat is unaffected:
-- the engine writes the manifest as a best-effort record, not as part of the
-- answer. Dropping the two policy columns returns connector and web results to
-- having no workspace gate at all, which is the state 0252 corrected.

begin;

drop table if exists public.context_manifests;

alter table public.organization_admin_policies
  drop column if exists allow_connector_context;

alter table public.organization_admin_policies
  drop column if exists allow_web_result_context;

delete from public.schema_migrations
 where filename = '0252_context_manifests_and_source_policy.sql';

commit;
