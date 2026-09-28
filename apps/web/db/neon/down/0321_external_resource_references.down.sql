-- Reversal of 0321 : external resources are no longer recorded canonically.
--
-- WHAT THIS COSTS: every stored external resource reference is deleted, and
-- project sources forget which connector item they were imported from. The
-- sources themselves and their bytes are untouched.

begin;

drop index if exists public.project_knowledge_files_external_reference_idx;
alter table public.project_knowledge_files drop column if exists external_reference_id;

drop policy if exists external_resource_references_tenant_isolation
  on public.external_resource_references;
drop trigger if exists set_external_resource_references_updated_at
  on public.external_resource_references;
drop index if exists public.external_resource_references_kind_idx;
drop index if exists public.external_resource_references_identity_idx;
drop table if exists public.external_resource_references;

delete from public.schema_migrations
 where filename = '0321_external_resource_references.sql';

commit;
