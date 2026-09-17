-- =============================================================================
-- Migration 0202: retrieval index (full text + vector) for search and RAG
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Project knowledge was stored as one extracted text per file and read
--          back by substring and in-memory BM25; /api/search matched ILIKE over
--          titles and messages and could not see artifacts, research reports or
--          developer sessions at all. Nothing was embedded, so there was no
--          semantic or hybrid retrieval anywhere on the managed cloud.
--
-- Shape  : `retrieval_documents` is one row per indexable source (a project
--          knowledge file, a library file, a chat, an artifact, a completed
--          research report, a developer session) holding its index state:
--          pending, indexing, indexed, stale or failed, the attempt count and
--          the last error the knowledge panel shows, and the chunk version that
--          is live. Exactly one source foreign key is set, and every one cascades,
--          so hard-deleting a source deletes its document and its chunks.
--
--          `retrieval_chunks` holds the passages of the live chunk version with
--          their character offsets and locator metadata, a generated weighted
--          `tsvector` (GIN) for full text, and an embedding (`vector`, HNSW,
--          cosine) for semantic retrieval. A chunk written without an embedding
--          is still found by full text.
--
-- Fresh  : Triggers enqueue a pending document when a source is created,
--          mark it stale when the source's text changes, and delete it when the
--          source is soft-deleted or superseded (restored sources re-enqueue).
--          Existing sources are enqueued here once; the retrieval-index cron
--          drains pending and stale documents through durable workflow steps.
--
-- ACL    : Both tables force RLS. A document is readable where its owner row is
--          visible in the active workspace, and a project knowledge document is
--          also readable wherever its knowledge file is (shared projects, 0090).
--          A chunk is readable exactly when its document is. Writes require the
--          caller to own both the document and the source it points at.
--
-- Depends: 0035 (project_knowledge_files), 0036 (media_assets), 0039
--          (web_artifacts), 0073 + 0110 (organization scope helpers), 0075
--          (cloud_code_sessions), 0082 (cloud_code_agent_turns), 0094
--          (research_reports), 0098 (knowledge superseded_at).
-- =============================================================================

begin;

create extension if not exists vector;

create table if not exists public.retrieval_documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  source_kind text not null check (
    source_kind in (
      'project_knowledge', 'library_file', 'conversation', 'artifact',
      'research_report', 'developer_session'
    )
  ),
  project_knowledge_file_id uuid references public.project_knowledge_files(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  conversation_id uuid references public.web_conversations(id) on delete cascade,
  artifact_id uuid references public.web_artifacts(id) on delete cascade,
  research_report_id uuid references public.research_reports(id) on delete cascade,
  cloud_code_session_id uuid references public.cloud_code_sessions(id) on delete cascade,
  source_id uuid not null generated always as (
    coalesce(
      project_knowledge_file_id, media_asset_id, conversation_id, artifact_id,
      research_report_id, cloud_code_session_id
    )
  ) stored,
  title text not null default '' check (char_length(title) <= 500),
  status text not null default 'pending' check (
    status in ('pending', 'indexing', 'indexed', 'stale', 'failed')
  ),
  chunk_version integer not null default 0 check (chunk_version >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  embedding_model text check (embedding_model is null or char_length(embedding_model) <= 200),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  workflow_run_id text check (workflow_run_id is null or char_length(workflow_run_id) <= 200),
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retrieval_documents_single_source check (
    num_nonnulls(
      project_knowledge_file_id, media_asset_id, conversation_id, artifact_id,
      research_report_id, cloud_code_session_id
    ) = 1
    and (source_kind = 'project_knowledge') = (project_knowledge_file_id is not null)
    and (source_kind = 'library_file') = (media_asset_id is not null)
    and (source_kind = 'conversation') = (conversation_id is not null)
    and (source_kind = 'artifact') = (artifact_id is not null)
    and (source_kind = 'research_report') = (research_report_id is not null)
    and (source_kind = 'developer_session') = (cloud_code_session_id is not null)
  ),
  constraint retrieval_documents_source_unique unique (source_kind, source_id)
);

create index if not exists idx_retrieval_documents_due
  on public.retrieval_documents (next_attempt_at)
  where status in ('pending', 'stale', 'failed');

create index if not exists idx_retrieval_documents_owner
  on public.retrieval_documents (user_id, organization_id, source_kind);

create index if not exists idx_retrieval_documents_conversation
  on public.retrieval_documents (conversation_id)
  where conversation_id is not null;

create index if not exists idx_retrieval_documents_session
  on public.retrieval_documents (cloud_code_session_id)
  where cloud_code_session_id is not null;

create table if not exists public.retrieval_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.retrieval_documents(id) on delete cascade,
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  source_kind text not null,
  source_id uuid not null,
  chunk_version integer not null check (chunk_version >= 1),
  chunk_index integer not null check (chunk_index >= 0),
  start_offset integer check (start_offset is null or start_offset >= 0),
  end_offset integer check (end_offset is null or end_offset >= start_offset),
  title text not null default '' check (char_length(title) <= 500),
  content text not null check (char_length(content) between 1 and 8000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  embedding vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, title), 'A')
      || setweight(to_tsvector('simple'::regconfig, content), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  constraint retrieval_chunks_position_unique unique (document_id, chunk_version, chunk_index)
);

create index if not exists idx_retrieval_chunks_search_vector
  on public.retrieval_chunks using gin (search_vector);

create index if not exists idx_retrieval_chunks_embedding
  on public.retrieval_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists idx_retrieval_chunks_owner
  on public.retrieval_chunks (user_id, organization_id, source_kind);

create index if not exists idx_retrieval_chunks_source
  on public.retrieval_chunks (source_kind, source_id);

grant select, insert, update, delete on public.retrieval_documents to app_rls;
grant select, insert, update, delete on public.retrieval_chunks to app_rls;

alter table public.retrieval_documents enable row level security;
alter table public.retrieval_documents force row level security;
alter table public.retrieval_chunks enable row level security;
alter table public.retrieval_chunks force row level security;

create or replace function public.app_retrieval_source_is_owned(
  owner_user_id text,
  knowledge_file_id uuid,
  asset_id uuid,
  chat_id uuid,
  web_artifact_id uuid,
  report_id uuid,
  code_session_id uuid
)
returns boolean
language sql
stable
as $$
  select owner_user_id = public.current_app_user_id()
     and (
       knowledge_file_id is null or exists (
         select 1
           from public.project_knowledge_files k
           join public.user_projects p on p.id = k.project_id
          where k.id = knowledge_file_id and p.user_id = owner_user_id
       )
     )
     and (
       asset_id is null or exists (
         select 1 from public.media_assets a where a.id = asset_id and a.user_id = owner_user_id
       )
     )
     and (
       chat_id is null or exists (
         select 1 from public.web_conversations c where c.id = chat_id and c.user_id = owner_user_id
       )
     )
     and (
       web_artifact_id is null or exists (
         select 1 from public.web_artifacts w where w.id = web_artifact_id and w.user_id = owner_user_id
       )
     )
     and (
       report_id is null or exists (
         select 1 from public.research_reports r where r.id = report_id and r.user_id = owner_user_id
       )
     )
     and (
       code_session_id is null or exists (
         select 1 from public.cloud_code_sessions s
          where s.id = code_session_id and s.user_id = owner_user_id
       )
     );
$$;

drop policy if exists retrieval_documents_read on public.retrieval_documents;
create policy retrieval_documents_read
  on public.retrieval_documents for select to app_rls
  using (
    public.app_row_is_visible(user_id, organization_id)
    or (
      project_knowledge_file_id is not null
      and exists (
        select 1
          from public.project_knowledge_files k
         where k.id = retrieval_documents.project_knowledge_file_id
      )
    )
  );

drop policy if exists retrieval_documents_owner_insert on public.retrieval_documents;
create policy retrieval_documents_owner_insert
  on public.retrieval_documents for insert to app_rls
  with check (
    public.app_row_is_writable(user_id, organization_id)
    and public.app_retrieval_source_is_owned(
      user_id, project_knowledge_file_id, media_asset_id, conversation_id, artifact_id,
      research_report_id, cloud_code_session_id
    )
  );

drop policy if exists retrieval_documents_owner_update on public.retrieval_documents;
create policy retrieval_documents_owner_update
  on public.retrieval_documents for update to app_rls
  using (public.app_row_is_writable(user_id, organization_id))
  with check (
    public.app_row_is_writable(user_id, organization_id)
    and public.app_retrieval_source_is_owned(
      user_id, project_knowledge_file_id, media_asset_id, conversation_id, artifact_id,
      research_report_id, cloud_code_session_id
    )
  );

drop policy if exists retrieval_documents_owner_delete on public.retrieval_documents;
create policy retrieval_documents_owner_delete
  on public.retrieval_documents for delete to app_rls
  using (public.app_row_is_writable(user_id, organization_id));

drop policy if exists retrieval_chunks_read on public.retrieval_chunks;
create policy retrieval_chunks_read
  on public.retrieval_chunks for select to app_rls
  using (
    exists (
      select 1 from public.retrieval_documents d where d.id = retrieval_chunks.document_id
    )
  );

drop policy if exists retrieval_chunks_owner_insert on public.retrieval_chunks;
create policy retrieval_chunks_owner_insert
  on public.retrieval_chunks for insert to app_rls
  with check (
    public.app_row_is_writable(user_id, organization_id)
    and exists (
      select 1
        from public.retrieval_documents d
       where d.id = retrieval_chunks.document_id
         and d.user_id = retrieval_chunks.user_id
         and d.organization_id is not distinct from retrieval_chunks.organization_id
         and d.source_kind = retrieval_chunks.source_kind
         and d.source_id = retrieval_chunks.source_id
    )
  );

drop policy if exists retrieval_chunks_owner_update on public.retrieval_chunks;
create policy retrieval_chunks_owner_update
  on public.retrieval_chunks for update to app_rls
  using (public.app_row_is_writable(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

drop policy if exists retrieval_chunks_owner_delete on public.retrieval_chunks;
create policy retrieval_chunks_owner_delete
  on public.retrieval_chunks for delete to app_rls
  using (public.app_row_is_writable(user_id, organization_id));

-- The triggers below run as the table owner so a source written by any role,
-- including privileged repositories and cron sweeps, keeps its index in step.

create or replace function public.retrieval_enqueue_document(
  p_user_id text,
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.retrieval_documents (
    user_id, organization_id, source_kind, title,
    project_knowledge_file_id, media_asset_id, conversation_id, artifact_id,
    research_report_id, cloud_code_session_id
  )
  values (
    p_user_id, p_organization_id, p_source_kind, left(coalesce(p_title, ''), 500),
    case when p_source_kind = 'project_knowledge' then p_source_id end,
    case when p_source_kind = 'library_file' then p_source_id end,
    case when p_source_kind = 'conversation' then p_source_id end,
    case when p_source_kind = 'artifact' then p_source_id end,
    case when p_source_kind = 'research_report' then p_source_id end,
    case when p_source_kind = 'developer_session' then p_source_id end
  )
  on conflict (source_kind, source_id) do nothing;
end;
$$;

create or replace function public.retrieval_mark_stale(p_source_kind text, p_source_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.retrieval_documents
     set status = 'stale', next_attempt_at = now(), updated_at = now()
   where source_kind = p_source_kind
     and source_id = p_source_id
     and status in ('indexed', 'indexing', 'failed');
$$;

create or replace function public.retrieval_forget_document(p_source_kind text, p_source_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.retrieval_documents
   where source_kind = p_source_kind and source_id = p_source_id;
$$;

revoke all on function public.retrieval_enqueue_document(text, uuid, text, uuid, text) from public;
revoke all on function public.retrieval_mark_stale(text, uuid) from public;
revoke all on function public.retrieval_forget_document(text, uuid) from public;

create or replace function public.retrieval_track_project_knowledge_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_organization uuid;
begin
  if new.deleted_at is not null or new.superseded_at is not null then
    perform public.retrieval_forget_document('project_knowledge', new.id);
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (old.deleted_at is null and old.superseded_at is null)
     and new.extracted_text is not distinct from old.extracted_text
     and new.file_name is not distinct from old.file_name then
    return new;
  end if;
  select p.user_id, p.organization_id into v_owner, v_organization
    from public.user_projects p
   where p.id = new.project_id;
  if v_owner is null then
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    v_owner, v_organization, 'project_knowledge', new.id, new.file_name
  );
  if tg_op = 'UPDATE' then
    perform public.retrieval_mark_stale('project_knowledge', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_project_knowledge_files on public.project_knowledge_files;
create trigger trg_retrieval_project_knowledge_files
  after insert or update of extracted_text, file_name, deleted_at, superseded_at
  on public.project_knowledge_files
  for each row execute function public.retrieval_track_project_knowledge_file();

create or replace function public.retrieval_track_media_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    perform public.retrieval_forget_document('library_file', new.id);
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    new.user_id, new.organization_id, 'library_file', new.id,
    coalesce(new.metadata->>'filename', new.kind)
  );
  if tg_op = 'UPDATE' and old.deleted_at is null then
    perform public.retrieval_mark_stale('library_file', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_media_assets on public.media_assets;
create trigger trg_retrieval_media_assets
  after insert or update of prompt, metadata, deleted_at
  on public.media_assets
  for each row execute function public.retrieval_track_media_asset();

create or replace function public.retrieval_track_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null or new.is_temporary then
    delete from public.retrieval_documents
     where conversation_id = new.id
        or artifact_id in (select a.id from public.web_artifacts a where a.conversation_id = new.id)
        or research_report_id in (
          select r.id from public.research_reports r where r.conversation_id = new.id
        );
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    new.user_id, new.organization_id, 'conversation', new.id, new.title
  );
  if tg_op = 'UPDATE' and old.deleted_at is null and not old.is_temporary then
    perform public.retrieval_mark_stale('conversation', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_web_conversations on public.web_conversations;
create trigger trg_retrieval_web_conversations
  after insert or update of title, deleted_at, is_temporary
  on public.web_conversations
  for each row execute function public.retrieval_track_conversation();

create or replace function public.retrieval_track_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.retrieval_documents
     set status = 'stale', next_attempt_at = now(), updated_at = now()
   where conversation_id = new.conversation_id
     and status in ('indexed', 'failed');
  return new;
end;
$$;

drop trigger if exists trg_retrieval_web_messages on public.web_messages;
create trigger trg_retrieval_web_messages
  after insert or update of content, deleted_at
  on public.web_messages
  for each row execute function public.retrieval_track_message();

create or replace function public.retrieval_track_artifact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    perform public.retrieval_forget_document('artifact', new.id);
    return new;
  end if;
  perform public.retrieval_enqueue_document(
    new.user_id, new.organization_id, 'artifact', new.id, new.title
  );
  if tg_op = 'UPDATE' and old.deleted_at is null then
    perform public.retrieval_mark_stale('artifact', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_web_artifacts on public.web_artifacts;
create trigger trg_retrieval_web_artifacts
  after insert or update of title, content, deleted_at
  on public.web_artifacts
  for each row execute function public.retrieval_track_artifact();

create or replace function public.retrieval_track_research_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization uuid;
begin
  if new.status <> 'completed' then
    return new;
  end if;
  select c.organization_id into v_organization
    from public.web_conversations c
   where c.id = new.conversation_id;
  perform public.retrieval_enqueue_document(
    new.user_id, v_organization, 'research_report', new.id, new.title
  );
  if tg_op = 'UPDATE' and old.status = 'completed' then
    perform public.retrieval_mark_stale('research_report', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_research_reports on public.research_reports;
create trigger trg_retrieval_research_reports
  after insert or update of status, title, summary, content
  on public.research_reports
  for each row execute function public.retrieval_track_research_report();

create or replace function public.retrieval_track_code_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.retrieval_enqueue_document(
    new.user_id, new.organization_id, 'developer_session', new.id, new.title
  );
  if tg_op = 'UPDATE' then
    perform public.retrieval_mark_stale('developer_session', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retrieval_cloud_code_sessions on public.cloud_code_sessions;
create trigger trg_retrieval_cloud_code_sessions
  after insert or update of title, repository_url
  on public.cloud_code_sessions
  for each row execute function public.retrieval_track_code_session();

create or replace function public.retrieval_track_code_turn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.retrieval_mark_stale('developer_session', new.session_id);
  return new;
end;
$$;

drop trigger if exists trg_retrieval_cloud_code_agent_turns on public.cloud_code_agent_turns;
create trigger trg_retrieval_cloud_code_agent_turns
  after insert or update of state, final_message
  on public.cloud_code_agent_turns
  for each row execute function public.retrieval_track_code_turn();

insert into public.retrieval_documents (user_id, organization_id, source_kind, title, project_knowledge_file_id)
select p.user_id, p.organization_id, 'project_knowledge', left(k.file_name, 500), k.id
  from public.project_knowledge_files k
  join public.user_projects p on p.id = k.project_id
 where k.deleted_at is null and k.superseded_at is null
on conflict (source_kind, source_id) do nothing;

insert into public.retrieval_documents (user_id, organization_id, source_kind, title, media_asset_id)
select a.user_id, a.organization_id, 'library_file', left(coalesce(a.metadata->>'filename', a.kind), 500), a.id
  from public.media_assets a
 where a.deleted_at is null
on conflict (source_kind, source_id) do nothing;

insert into public.retrieval_documents (user_id, organization_id, source_kind, title, conversation_id)
select c.user_id, c.organization_id, 'conversation', left(coalesce(c.title, ''), 500), c.id
  from public.web_conversations c
 where c.deleted_at is null and not c.is_temporary
on conflict (source_kind, source_id) do nothing;

insert into public.retrieval_documents (user_id, organization_id, source_kind, title, artifact_id)
select w.user_id, w.organization_id, 'artifact', left(coalesce(w.title, ''), 500), w.id
  from public.web_artifacts w
 where w.deleted_at is null
on conflict (source_kind, source_id) do nothing;

insert into public.retrieval_documents (user_id, organization_id, source_kind, title, research_report_id)
select r.user_id, c.organization_id, 'research_report', left(r.title, 500), r.id
  from public.research_reports r
  left join public.web_conversations c on c.id = r.conversation_id
 where r.status = 'completed'
on conflict (source_kind, source_id) do nothing;

insert into public.retrieval_documents (user_id, organization_id, source_kind, title, cloud_code_session_id)
select s.user_id, s.organization_id, 'developer_session', left(s.title, 500), s.id
  from public.cloud_code_sessions s
on conflict (source_kind, source_id) do nothing;

comment on table public.retrieval_documents is
  'Index state for one searchable source: pending, indexing, indexed, stale or failed, with attempts, last error and the live chunk version.';
comment on table public.retrieval_chunks is
  'Passages of a retrieval document at its live chunk version, with offsets, locator metadata, a weighted tsvector and an optional embedding.';

commit;
