-- Reversal of 0192 : forget where in a file each passage came from.
--
-- WHAT THIS COSTS: a turn that reads project knowledge can no longer name the
-- page or heading a passage came from until the file is extracted again after
-- the column returns. The extracted text itself is untouched.

begin;

alter table public.project_knowledge_files
  drop constraint if exists project_knowledge_files_extracted_anchors_array;

alter table public.project_knowledge_files
  drop column if exists extracted_anchors;

delete from public.schema_migrations
 where filename = '0192_project_knowledge_anchors.sql';

commit;
