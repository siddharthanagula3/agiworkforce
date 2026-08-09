-- Reverses 0098_project_knowledge_versions.sql.
--
-- LOSSY IN ONE DIRECTION: the rows survive, the version graph does not. Every
-- row a newer upload superseded becomes an ordinary active file again, so a
-- project that re-uploaded a corrected file shows both copies to the model and
-- counts both against its 20-file budget — exactly the behaviour 0098 was
-- written to end. Delete the superseded rows before rolling back if that
-- matters more than keeping them; this script will not choose for you.
--
-- `idx_project_knowledge_files_active` is dropped by the column drop below
-- (its predicate reads superseded_at), so it is recreated here with 0035's
-- definition rather than left to Postgres. Recreating it is the whole reason
-- this file cannot just be three DROP COLUMNs.

begin;

drop index if exists public.idx_project_knowledge_files_supersedes;

alter table public.project_knowledge_files
  drop constraint if exists project_knowledge_files_supersedes_fk;

alter table public.project_knowledge_files
  drop column if exists superseded_at,
  drop column if exists supersedes_id,
  drop column if exists version;

drop index if exists public.idx_project_knowledge_files_active;
create index if not exists idx_project_knowledge_files_active
  on public.project_knowledge_files (project_id, added_at desc)
  where deleted_at is null;

delete from public.schema_migrations where filename = '0098_project_knowledge_versions.sql';

commit;
