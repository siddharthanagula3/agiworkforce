-- Store bounded text extracted from project knowledge objects by the server.
-- Existing rows remain metadata-only until they are re-uploaded or backfilled.

alter table if exists public.project_knowledge_files
  add column if not exists extracted_text text,
  add column if not exists extracted_at timestamptz;

alter table if exists public.project_knowledge_files
  drop constraint if exists project_knowledge_files_extracted_text_bounded;

alter table if exists public.project_knowledge_files
  add constraint project_knowledge_files_extracted_text_bounded
  check (extracted_text is null or char_length(extracted_text) <= 200050);
