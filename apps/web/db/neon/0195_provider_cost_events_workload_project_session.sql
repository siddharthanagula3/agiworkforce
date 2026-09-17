-- 0195 : attribute each cost event to the product area, project and session
--        that spent it.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- `capability` says what kind of resource was consumed (tokens, a sandbox
-- minute, an image). It cannot say whether those tokens were a chat, an
-- AGI Work task, a Deep Research run, an AGI Code session or a browser task,
-- and a finance owner asking "what did Research cost us" needs exactly that.
-- Project and session were only recoverable through `source_ref` or metadata
-- scans, so no query could group by them.
--
-- workload   : chat | work | research | code | browser, null when the caller
--              could not attribute one rather than a guess
-- project_id : the project the conversation belonged to when it was spent
-- session_id : the conversation or code session that spent it
--
-- All nullable, so rows written before this change stay valid and unattributed.

begin;

alter table public.provider_cost_events
  add column if not exists workload text
    check (workload is null or workload = any (array['chat', 'work', 'research', 'code', 'browser'])),
  add column if not exists project_id text
    check (project_id is null or length(project_id) between 1 and 200),
  add column if not exists session_id text
    check (session_id is null or length(session_id) between 1 and 200);

create index if not exists idx_provider_cost_events_org_workload_occurred
  on public.provider_cost_events (organization_id, workload, occurred_at desc)
  where organization_id is not null and workload is not null;

create index if not exists idx_provider_cost_events_org_project_occurred
  on public.provider_cost_events (organization_id, project_id, occurred_at desc)
  where organization_id is not null and project_id is not null;

comment on column public.provider_cost_events.workload is
  'The product area that spent this: chat, work (AGI Work), research (Deep Research), code (AGI Code) or browser (computer use). Null when unattributed.';
comment on column public.provider_cost_events.project_id is
  'The project the spending conversation belonged to at the time. Not a foreign key: a deleted project keeps its cost history.';
comment on column public.provider_cost_events.session_id is
  'The conversation or code session that spent this. Not a foreign key, for the same reason.';

commit;
