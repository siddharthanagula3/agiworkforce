-- 0241 : the workspace a cost is attributed to, and a source surface that is
--        a value rather than free text.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Part 1, workspace attribution.
--
-- 0166 gave provider_cost_events the organization whose plan funds the usage,
-- which is the billing dimension. It is not the container dimension: 0234
-- introduced public.workspaces, where a personal workspace has no
-- organization at all, so every personal-scope cost row carries a null
-- organization and no container. "What did this workspace spend" therefore had
-- no answer for personal usage and, once a tenant holds more than one
-- workspace, no answer for organization usage either, because both workspaces
-- roll up to the same organization_id.
--
-- workspace_id is nullable and nothing is backfilled. An existing row does not
-- gain a workspace from a guess: the primary workspace of the funding
-- organization is a plausible reading, not a recorded fact, and back-filling
-- it would make a spend report read as measurement when it is inference.
-- on delete set null for the same reason organization_id uses it: a financial
-- record outlives the container it was incurred in.
--
-- Part 2, source surface.
--
-- project_knowledge_files.source_surface (0006) is plain text. The API has
-- validated it against the surface list since it shipped, so the column and
-- the route already disagree only in what they permit, never in what they
-- hold. The constraint is added NOT VALID: it binds every new row without
-- scanning or rejecting rows written before the list existed, which is what
-- lets it go on in one statement on a live table. The list matches
-- 0240's origin_surface constraint; the two columns answer the same question
-- about different resources and must not drift apart.
--
-- Depends: 0006 (project_knowledge_files), 0127 (provider_cost_events),
--          0166 (provider_cost_events.organization_id), 0234 (workspaces),
--          0240 (origin_surface, the same surface list)

begin;

alter table public.provider_cost_events
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

create index if not exists idx_provider_cost_events_workspace
  on public.provider_cost_events (workspace_id, occurred_at);

comment on column public.provider_cost_events.workspace_id is
  'The workspace the usage was incurred in, which is the container dimension and not the funding one. Null for rows written before this column existed and for a caller that could not attribute one.';

alter table public.project_knowledge_files
  drop constraint if exists project_knowledge_files_source_surface_check;

alter table public.project_knowledge_files
  add constraint project_knowledge_files_source_surface_check
    check (
      source_surface is null
      or source_surface = any (
        array['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome', 'api']
      )
    )
    not valid;

comment on column public.project_knowledge_files.source_surface is
  'The surface the file was added from, one of the canonical source surfaces. Constrained NOT VALID so rows written before the list existed are kept rather than rejected.';

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. No cost row is retroactively attributed to a workspace:
-- --    SELECT count(*) FROM public.provider_cost_events WHERE workspace_id IS NOT NULL;
-- --    EXPECT: 0
--
-- -- 2. A personal workspace can now carry spend that no organization funds:
-- --    SELECT workspace_id, organization_id FROM public.provider_cost_events
-- --     WHERE workspace_id IS NOT NULL AND organization_id IS NULL LIMIT 5;
-- --    EXPECT: rows are possible (none yet, before any new write)
--
-- -- 3. A new knowledge file with an unknown surface is refused:
-- --    INSERT INTO public.project_knowledge_files (project_id, file_name, source_surface)
-- --    VALUES ('<an existing project id>', 'v.txt', 'fax-machine');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 4. Rows written before the constraint are still readable and updatable:
-- --    SELECT count(*) FROM public.project_knowledge_files;
-- --    EXPECT: unchanged by the apply
-- =============================================================================
