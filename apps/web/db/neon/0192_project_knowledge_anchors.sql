-- 0192 : remember where in a file a passage came from.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Project knowledge is stored as one extracted text per file, not as a chunk
-- table, so a retrieved passage knows its character offsets and nothing else.
-- A reader asking about something on page 12 of a 40 page PDF gets the right
-- sentence and no way to check it against the document.
--
-- This records, per file, where each page (for a paginated document) or each
-- heading (for an office, notebook, markdown or plain-text document) begins in
-- the stored text. Retrieval maps a passage's offset back to the nearest entry,
-- which is what lets a turn say which page an answer came from and open the
-- file preview there.
--
-- Kept beside the text rather than in its own table: the anchors are only ever
-- read with the text they index, they are written once by the same extraction,
-- and they die with the row.

begin;

alter table public.project_knowledge_files
  add column if not exists extracted_anchors jsonb;

alter table public.project_knowledge_files
  drop constraint if exists project_knowledge_files_extracted_anchors_array;

alter table public.project_knowledge_files
  add constraint project_knowledge_files_extracted_anchors_array
  check (extracted_anchors is null or jsonb_typeof(extracted_anchors) = 'array');

comment on column public.project_knowledge_files.extracted_anchors is
  'Where each page or heading begins in extracted_text: [{start, page?, heading?}], ascending by start. Null for a row extracted before this column existed.';

commit;
