-- Reversal of 0257, drop file versions and the lineage graph.
--
-- COST, read this before running it: every published artifact version other
-- than the live one is deleted, so nothing can be restored afterwards, and the
-- whole derivation graph goes with it, so no file can say what it was made out
-- of again. The live artifacts, media assets and project files themselves are
-- untouched; only their history and their parents are lost.

begin;

drop policy if exists file_lineage_owner on public.file_lineage;
drop index if exists public.idx_file_lineage_child;
drop index if exists public.idx_file_lineage_parent;
drop table if exists public.file_lineage;

drop policy if exists published_artifact_versions_owner_delete on public.published_artifact_versions;
drop policy if exists published_artifact_versions_owner_insert on public.published_artifact_versions;
drop policy if exists published_artifact_versions_owner_read on public.published_artifact_versions;
drop index if exists public.idx_published_artifact_versions_newest;
drop table if exists public.published_artifact_versions;

drop index if exists public.idx_project_knowledge_files_parent_version;
drop index if exists public.idx_media_assets_parent_version;

alter table if exists public.project_knowledge_files
  drop column if exists parent_version_id,
  drop column if exists version;

alter table if exists public.published_artifacts
  drop column if exists version;

alter table if exists public.media_assets
  drop column if exists parent_version_id,
  drop column if exists version;

delete from public.schema_migrations
 where filename = '0257_file_versions_and_lineage.sql';

commit;
