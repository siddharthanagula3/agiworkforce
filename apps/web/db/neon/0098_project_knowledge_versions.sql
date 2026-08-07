-- 0098_project_knowledge_versions.sql
--
-- File version history for project knowledge files.
--
-- Re-uploading a corrected file created a completely unrelated row: the old
-- version stayed active, so the model saw BOTH the stale and the corrected
-- text, the project's 20-file budget was consumed twice, and the user had no
-- way to tell which row was current. Deleting the old one by hand was the only
-- workaround, and it destroyed the history.
--
-- Same file name + DIFFERENT checksum is an edit, and gets a new version that
-- supersedes the previous one. Same name + SAME checksum is a duplicate and is
-- rejected before it reaches the table (see the knowledge-files POST route);
-- these two rules are complementary and neither is sufficient alone.

alter table if exists public.project_knowledge_files
  -- 1-based. Existing rows are all version 1 by definition.
  add column if not exists version integer not null default 1;

alter table if exists public.project_knowledge_files
  -- The row this one replaced. Null for a first upload.
  add column if not exists supersedes_id uuid;

alter table if exists public.project_knowledge_files
  -- Set when a newer version replaces this row. A superseded row is NOT
  -- soft-deleted: `deleted_at` means the user removed the file, and conflating
  -- "replaced" with "deleted" would make restore-a-version impossible.
  add column if not exists superseded_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_knowledge_files'
       and column_name = 'supersedes_id'
  ) then
    begin
      alter table public.project_knowledge_files
        add constraint project_knowledge_files_supersedes_fk
        foreign key (supersedes_id)
        references public.project_knowledge_files (id)
        on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

-- The active-files list must exclude superseded rows, so the existing
-- project+deleted_at index is no longer selective enough on its own.
--
-- 0035 already created an index under THIS NAME with only the `deleted_at`
-- predicate. `create index if not exists` matches on name alone, so without the
-- drop below it silently keeps 0035's weaker definition and this statement is a
-- no-op — the index looks present, the comment above claims a narrower one, and
-- the planner still scans superseded rows. Dropping first is what actually
-- replaces it, and both statements are idempotent so the pair stays re-runnable.
drop index if exists public.idx_project_knowledge_files_active;
create index if not exists idx_project_knowledge_files_active
  on public.project_knowledge_files (project_id, added_at desc)
  where deleted_at is null and superseded_at is null;

-- Version-history lookups for one logical file.
create index if not exists idx_project_knowledge_files_supersedes
  on public.project_knowledge_files (supersedes_id)
  where supersedes_id is not null;
