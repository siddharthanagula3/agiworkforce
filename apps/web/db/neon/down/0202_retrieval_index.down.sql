-- Reversal of 0202 : drop the retrieval index.
--
-- WHAT THIS COSTS: search loses full text, semantic and hybrid ranking over
-- chats, library files, artifacts, research reports and developer sessions, and
-- project knowledge retrieval falls back to per-request passage selection. Every
-- stored chunk and embedding is deleted; re-applying 0202 re-enqueues every
-- source and the index is rebuilt (and its embeddings paid for) again. The
-- `vector` extension is left installed, as cluster-wide extensions are.

begin;

drop trigger if exists trg_retrieval_cloud_code_agent_turns on public.cloud_code_agent_turns;
drop trigger if exists trg_retrieval_cloud_code_sessions on public.cloud_code_sessions;
drop trigger if exists trg_retrieval_research_reports on public.research_reports;
drop trigger if exists trg_retrieval_web_artifacts on public.web_artifacts;
drop trigger if exists trg_retrieval_web_messages on public.web_messages;
drop trigger if exists trg_retrieval_web_conversations on public.web_conversations;
drop trigger if exists trg_retrieval_media_assets on public.media_assets;
drop trigger if exists trg_retrieval_project_knowledge_files on public.project_knowledge_files;

drop function if exists public.retrieval_track_code_turn();
drop function if exists public.retrieval_track_code_session();
drop function if exists public.retrieval_track_research_report();
drop function if exists public.retrieval_track_artifact();
drop function if exists public.retrieval_track_message();
drop function if exists public.retrieval_track_conversation();
drop function if exists public.retrieval_track_media_asset();
drop function if exists public.retrieval_track_project_knowledge_file();

drop policy if exists retrieval_chunks_owner_delete on public.retrieval_chunks;
drop policy if exists retrieval_chunks_owner_update on public.retrieval_chunks;
drop policy if exists retrieval_chunks_owner_insert on public.retrieval_chunks;
drop policy if exists retrieval_chunks_read on public.retrieval_chunks;
drop policy if exists retrieval_documents_owner_delete on public.retrieval_documents;
drop policy if exists retrieval_documents_owner_update on public.retrieval_documents;
drop policy if exists retrieval_documents_owner_insert on public.retrieval_documents;
drop policy if exists retrieval_documents_read on public.retrieval_documents;

alter table if exists public.retrieval_chunks disable row level security;
alter table if exists public.retrieval_documents disable row level security;

drop index if exists public.idx_retrieval_chunks_source;
drop index if exists public.idx_retrieval_chunks_owner;
drop index if exists public.idx_retrieval_chunks_embedding;
drop index if exists public.idx_retrieval_chunks_search_vector;
drop index if exists public.idx_retrieval_documents_session;
drop index if exists public.idx_retrieval_documents_conversation;
drop index if exists public.idx_retrieval_documents_owner;
drop index if exists public.idx_retrieval_documents_due;

alter table if exists public.retrieval_chunks
  drop constraint if exists retrieval_chunks_position_unique;
alter table if exists public.retrieval_documents
  drop constraint if exists retrieval_documents_source_unique;
alter table if exists public.retrieval_documents
  drop constraint if exists retrieval_documents_single_source;

drop table if exists public.retrieval_chunks;
drop table if exists public.retrieval_documents;

drop function if exists public.retrieval_forget_document(text, uuid);
drop function if exists public.retrieval_mark_stale(text, uuid);
drop function if exists public.retrieval_enqueue_document(text, uuid, text, uuid, text);
drop function if exists public.app_retrieval_source_is_owned(text, uuid, uuid, uuid, uuid, uuid, uuid);

delete from public.schema_migrations
 where filename = '0202_retrieval_index.sql';

commit;
