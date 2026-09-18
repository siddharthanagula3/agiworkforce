-- =============================================================================
-- Migration 0257: file versions and the lineage graph
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a file had no history and no parent. Re-publishing an artifact
--          overwrote the row (0095 makes republish an UPSERT), so the earlier
--          version was gone and the client-side versionsById in
--          packages/platform/artifacts had nothing on the server to restore
--          from. Generated files carried provider, prompt and conversation but
--          never the uploaded file they were made out of, so "where did this
--          export come from" was unanswerable once the chat scrolled away.
--
-- Shape  : `version` and `parent_version_id` on the three tables that hold a
--          file's bytes, `published_artifact_versions` as the append-only
--          history a restore reads, and `file_lineage` as the derivation graph
--          connecting an upload to the edits and exports made from it.
--
-- Values : nothing stored is renamed or rewritten. Every existing row keeps its
--          content and becomes version 1 with no parent, which is what it is.
--
-- Depends: 0006 (project_knowledge_files), 0036 (media_assets),
--          0037 (current_app_user_id), 0095 (published_artifacts)
-- =============================================================================

begin;

-- Generated files and uploads live in media_assets. A new revision is a new row
-- pointing at the one it replaced, so the bytes of an older version survive.
alter table if exists public.media_assets
  add column if not exists version integer not null default 1,
  add column if not exists parent_version_id uuid references public.media_assets(id) on delete set null;

alter table if exists public.published_artifacts
  add column if not exists version integer not null default 1;

alter table if exists public.project_knowledge_files
  add column if not exists version integer not null default 1,
  add column if not exists parent_version_id uuid references public.project_knowledge_files(id) on delete set null;

create index if not exists idx_media_assets_parent_version
  on public.media_assets (parent_version_id)
  where parent_version_id is not null;

create index if not exists idx_project_knowledge_files_parent_version
  on public.project_knowledge_files (parent_version_id)
  where parent_version_id is not null;

-- Append-only history for a published page. The live row in
-- published_artifacts stays the newest version; every version ever published,
-- including that one, has a row here, so a restore is a read and a republish
-- rather than an undo of something already overwritten.
create table if not exists public.published_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  published_artifact_id uuid not null
    references public.published_artifacts(id) on delete cascade,
  user_id text not null,
  version integer not null check (version >= 1),
  title text not null default '' check (length(title) <= 300),
  -- Must stay in step with PUBLISHABLE_KINDS in
  -- lib/services/published-artifact-service.ts, exactly as 0095 does.
  kind text not null check (
    kind in ('html', 'react', 'svg', 'mermaid', 'markdown', 'text', 'code')
  ),
  language text check (language is null or length(language) <= 50),
  content text not null check (length(content) <= 1000000),
  parent_version_id uuid
    references public.published_artifact_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (published_artifact_id, version)
);

create index if not exists idx_published_artifact_versions_newest
  on public.published_artifact_versions (published_artifact_id, version desc);

grant select, insert, delete on public.published_artifact_versions to app_rls;

alter table public.published_artifact_versions enable row level security;
alter table public.published_artifact_versions force row level security;

-- No update policy at all: a version that can be edited is not history.
drop policy if exists published_artifact_versions_owner_read on public.published_artifact_versions;
create policy published_artifact_versions_owner_read
  on public.published_artifact_versions for select to app_rls
  using (user_id = public.current_app_user_id());

drop policy if exists published_artifact_versions_owner_insert on public.published_artifact_versions;
create policy published_artifact_versions_owner_insert
  on public.published_artifact_versions for insert to app_rls
  with check (
    user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.published_artifacts as parent
       where parent.id = published_artifact_id
         and parent.user_id = public.current_app_user_id()
    )
  );

drop policy if exists published_artifact_versions_owner_delete on public.published_artifact_versions;
create policy published_artifact_versions_owner_delete
  on public.published_artifact_versions for delete to app_rls
  using (user_id = public.current_app_user_id());

-- The derivation graph: which file these bytes were made out of. Ids are text
-- because a file is a media_asset uuid on one surface and a published token on
-- another, and a foreign key to one of them would exclude the other.
create table if not exists public.file_lineage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid,
  child_file_id text not null check (char_length(btrim(child_file_id)) between 1 and 400),
  parent_file_id text not null check (char_length(btrim(parent_file_id)) between 1 and 400),
  -- Must stay in step with FILE_DERIVATIONS in
  -- packages/contracts/types/src/file-model.ts.
  derivation text not null check (
    derivation in ('edit', 'export', 'conversion', 'extraction', 'copy')
  ),
  generated_by_turn_id text check (generated_by_turn_id is null
    or char_length(generated_by_turn_id) between 1 and 200),
  conversation_id uuid references public.web_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint file_lineage_is_not_its_own_parent check (child_file_id <> parent_file_id),
  unique (child_file_id, parent_file_id, derivation)
);

-- "What came out of this file", the Library's derived-from list.
create index if not exists idx_file_lineage_parent
  on public.file_lineage (user_id, parent_file_id, created_at desc);

-- "What was this made from", read once per file row.
create index if not exists idx_file_lineage_child
  on public.file_lineage (user_id, child_file_id);

grant select, insert, delete on public.file_lineage to app_rls;

alter table public.file_lineage enable row level security;
alter table public.file_lineage force row level security;

drop policy if exists file_lineage_owner on public.file_lineage;
create policy file_lineage_owner
  on public.file_lineage for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.published_artifact_versions is
  'Append-only history of every version of a published artifact. There is no update policy: a version that can be edited is not history. Restore reads a row here and republishes it as a new version.';

comment on table public.file_lineage is
  'Which file a file was made out of. One row per derivation edge, so an upload, the edits made from it and the exports taken from those form a walkable graph.';

comment on column public.media_assets.version is
  'Revision number within this file identity, starting at 1. A new revision is a new row whose parent_version_id names the one it replaced; the older rows bytes are never overwritten.';

comment on column public.published_artifacts.version is
  'The version this live row holds. Every version, including this one, also has a row in published_artifact_versions.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Existing rows became version 1 with no parent:
-- --    SELECT count(*) FROM public.media_assets WHERE version <> 1;  -- EXPECT: 0
--
-- -- 2. History cannot be rewritten, only appended:
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', '<owner>', true);
-- --    UPDATE public.published_artifact_versions SET content = 'x';
-- --    EXPECT: permission denied (no update grant, no update policy).
--
-- -- 3. Two versions of one artifact cannot collide:
-- --    INSERT ... (published_artifact_id, version) twice with the same version
-- --    EXPECT: unique violation.
--
-- -- 4. A file cannot be its own parent:
-- --    INSERT INTO public.file_lineage (..., child_file_id, parent_file_id, ...)
-- --      VALUES (..., 'f1', 'f1', 'edit');  -- EXPECT: check violation.
--
-- -- 5. Another user cannot read the graph:
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', 'user_2', true);
-- --    SELECT count(*) FROM public.file_lineage;  -- EXPECT: 0
