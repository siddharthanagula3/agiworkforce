-- 0094_research_reports.sql
--
-- Durable Deep Research reports (CAP-045 slice 1).
--
-- The server-side research loop
-- (app/api/llm/v1/chat/completions/lib/research-loop.ts) ran plan -> gather ->
-- synthesize entirely in-stream: if the browser tab closed, or the run failed
-- mid-way, everything the run gathered was lost and the only artifact was the
-- assistant message text. This table is the durable sink so a report survives
-- the request that produced it, and so a failed/interrupted run leaves enough
-- behind for a retry to resume instead of re-searching from zero.
--
-- Column shape mirrors the ResearchReport contract
-- (packages/contracts/types/src/research.ts) one-for-one:
--   title/summary/content/citations/steps/status/sources_consulted/duration_ms
-- plus the run linkage (user_id / conversation_id / request_id).
--
-- request_id is the managed chat idempotency key, exactly as in
-- public.cloud_agent_runs (0061). `unique (user_id, request_id)` makes the
-- write an upsert: the loop persists an interrupted/failed row first and
-- overwrites it with the completed report, and a same-request replay can never
-- create a second row.
--
-- v1 is request-bound (no background job survival — tracked separately), so
-- there is no scheduler/lease column here. Adding one dishonestly would imply
-- a resumption capability that does not exist.

create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  request_id text not null check (length(request_id) between 1 and 128),
  conversation_id uuid references public.web_conversations(id) on delete cascade,
  -- The research question the run was started from (ResearchQuery.query).
  query text not null default '',
  title text not null default '',
  summary text not null default '',
  content text not null default '',
  -- Citation[] / ResearchStep[] exactly as the contract defines them.
  citations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(citations) = 'array'),
  steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(steps) = 'array'),
  key_findings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(key_findings) = 'array'),
  status text not null check (
    status in (
      'pending', 'researching', 'synthesizing', 'completed', 'interrupted', 'failed'
    )
  ),
  sources_consulted integer not null default 0 check (sources_consulted >= 0),
  duration_ms integer check (duration_ms >= 0),
  -- Honest failure text for status in ('failed', 'interrupted'); never a stub.
  error text,
  model text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_id)
);

-- "My research" list view: newest first, per user.
create index if not exists idx_research_reports_user_created
  on public.research_reports (user_id, created_at desc);

-- Conversation-scoped lookup (render the persisted report next to its turn).
create index if not exists idx_research_reports_conversation
  on public.research_reports (conversation_id, created_at desc)
  where conversation_id is not null;

-- Resume candidates: only unfinished runs are ever scanned.
create index if not exists idx_research_reports_resumable
  on public.research_reports (user_id, updated_at desc)
  where status in ('pending', 'researching', 'synthesizing', 'interrupted', 'failed');

grant select, insert, update, delete on public.research_reports to app_rls;

alter table public.research_reports enable row level security;
alter table public.research_reports force row level security;

-- Owner-only isolation, enforced in the database (not merely a where clause).
-- The insert/update WITH CHECK also verifies the conversation belongs to the
-- same caller, so a report can never be attached to someone else's chat.
drop policy if exists research_reports_owner_read on public.research_reports;
create policy research_reports_owner_read
  on public.research_reports for select to app_rls
  using (user_id = public.current_app_user_id());

drop policy if exists research_reports_owner_insert on public.research_reports;
create policy research_reports_owner_insert
  on public.research_reports for insert to app_rls
  with check (
    user_id = public.current_app_user_id()
    and (
      conversation_id is null
      or exists (
        select 1
          from public.web_conversations as conversation
         where conversation.id = conversation_id
           and conversation.user_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists research_reports_owner_update on public.research_reports;
create policy research_reports_owner_update
  on public.research_reports for update to app_rls
  using (user_id = public.current_app_user_id())
  with check (
    user_id = public.current_app_user_id()
    and (
      conversation_id is null
      or exists (
        select 1
          from public.web_conversations as conversation
         where conversation.id = conversation_id
           and conversation.user_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists research_reports_owner_delete on public.research_reports;
create policy research_reports_owner_delete
  on public.research_reports for delete to app_rls
  using (user_id = public.current_app_user_id());

comment on table public.research_reports is
  'Durable Deep Research reports: the persisted ResearchReport contract for one research run, keyed by the managed chat idempotency key.';

comment on column public.research_reports.status is
  'Lifecycle status. interrupted = stopped with real gathered material (resumable); failed = errored with an honest error message.';
