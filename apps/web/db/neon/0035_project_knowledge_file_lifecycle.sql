-- Add knowledge-file lifecycle columns that the API + row mapper already
-- assume exist. Migration 0006 created project_knowledge_files with only
-- created_at / updated_at, but GET/POST/DELETE handlers and
-- mapKnowledgeFileRow reference added_at, retention_expires_at, deleted_at.
-- Without these columns every request raised PG 42703 (undefined_column) -> 500.

alter table if exists public.project_knowledge_files
  add column if not exists added_at timestamptz not null default now(),
  add column if not exists retention_expires_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Backfill added_at from created_at for any rows that predate the column
-- (the default now() would otherwise stamp them at migration time).
update public.project_knowledge_files
  set added_at = created_at
  where created_at is not null and added_at <> created_at;

-- Support the active-files list query: WHERE project_id = $1 AND deleted_at IS NULL ORDER BY added_at DESC
create index if not exists idx_project_knowledge_files_active
  on public.project_knowledge_files(project_id, added_at desc)
  where deleted_at is null;
