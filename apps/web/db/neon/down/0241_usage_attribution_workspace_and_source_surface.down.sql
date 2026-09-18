-- Reversal of 0241, drop the workspace dimension and the source-surface check.
--
-- COST, read this before running it: dropping workspace_id destroys the
-- container attribution on every cost row written since the apply, and it
-- cannot be recovered from organization_id because a personal workspace funds
-- nothing and an organization may hold more than one workspace. Export
-- (id, workspace_id) from provider_cost_events first if any workspace spend
-- report has been issued.
--
-- Dropping the check constraint lets project_knowledge_files.source_surface
-- accept free text again, which is what it did before 0241.

begin;

drop index if exists public.idx_provider_cost_events_workspace;

alter table public.provider_cost_events
  drop column if exists workspace_id;

alter table public.project_knowledge_files
  drop constraint if exists project_knowledge_files_source_surface_check;

comment on column public.project_knowledge_files.source_surface is null;

delete from public.schema_migrations
 where filename = '0241_usage_attribution_workspace_and_source_surface.sql';

commit;
