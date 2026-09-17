-- 0210 : event triggers that fire a scheduled task when something happens.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A trigger binds one source (Gmail, Slack, Google Calendar, GitHub or a
-- connector webhook) and a set of event types to a scheduled task (0009,
-- including the event-only tasks 0209 adds). Receivers verify the provider's
-- signature, match enabled triggers, and record every delivery they considered
-- in event_trigger_events with its outcome: filtered by conditions, debounced,
-- enqueued, fired, failed or dead. They never run the task inline; a matched
-- delivery becomes a background job (0208) that retries with backoff and
-- dead-letters, and the job starts the run with trigger_source 'webhook'.
--
-- source_account is the provider-side identity the trigger listens to: the
-- Gmail address, the Slack team id, or the GitHub repository (owner/name).
-- Calendar and connector triggers are addressed by the trigger id itself.
-- verification_status holds a trigger back until ownership of that account is
-- proven: a GitHub trigger by the account's own GitHub App installation at
-- delivery time, a Slack trigger by posting its verification code in the
-- workspace, a Gmail or Calendar trigger by the provider watch registered with
-- the account's own OAuth grant. Only verification_code_sha256 is stored.
--
-- event_trigger_events is the audit trail, deduplicated per trigger on the
-- provider's delivery id so a redelivery is recorded once.
--
-- app_rls sees and manages only the signed-in account's own triggers and reads
-- their events. It cannot mark a trigger verified or change what it listens
-- to: verification columns, source and source_account are written only by the
-- service role, and an insert must start unverified unless the source proves
-- ownership at delivery time (GitHub installation, connector signing secret),
-- and the task it fires must be one the account can see.
--
-- Erasure: the profile foreign keys cascade, and account-erasure names both
-- tables explicitly so the export inventory has to answer for them.

begin;

create table if not exists public.event_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  task_id uuid not null references public.scheduled_tasks(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  source text not null
    check (source = any (array['gmail', 'slack', 'google_calendar', 'github', 'connector'])),
  event_types text[] not null
    check (cardinality(event_types) between 1 and 20),
  source_account text
    check (source_account is null or char_length(source_account) between 1 and 320),
  conditions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) <= 10),
  debounce_seconds integer not null default 0 check (debounce_seconds between 0 and 86400),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 10),
  is_enabled boolean not null default true,
  verification_status text not null default 'pending'
    check (verification_status = any (array['pending', 'verified'])),
  verification_code_sha256 text
    check (verification_code_sha256 is null or verification_code_sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_triggers_account_required
    check (source = any (array['google_calendar', 'connector']) or source_account is not null)
);

create index if not exists idx_event_triggers_source_account
  on public.event_triggers (source, source_account)
  where is_enabled = true;

create index if not exists idx_event_triggers_user
  on public.event_triggers (user_id, created_at desc);

create index if not exists idx_event_triggers_task
  on public.event_triggers (task_id);

create index if not exists idx_event_triggers_organization
  on public.event_triggers (organization_id)
  where organization_id is not null;

create table if not exists public.event_trigger_events (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid not null references public.event_triggers(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  source text not null
    check (source = any (array['gmail', 'slack', 'google_calendar', 'github', 'connector'])),
  event_type text not null check (char_length(event_type) between 1 and 120),
  delivery_id text not null check (char_length(delivery_id) between 1 and 255),
  outcome text not null
    check (outcome = any (array['received', 'filtered', 'debounced', 'enqueued', 'fired', 'failed', 'dead'])),
  detail text check (detail is null or char_length(detail) <= 2000),
  job_id uuid references public.background_jobs(id) on delete set null,
  run_id uuid references public.scheduled_task_runs(id) on delete set null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_trigger_events_delivery_unique unique (trigger_id, delivery_id)
);

create index if not exists idx_event_trigger_events_trigger
  on public.event_trigger_events (trigger_id, received_at desc);

create index if not exists idx_event_trigger_events_received
  on public.event_trigger_events (received_at);

create index if not exists idx_event_trigger_events_user
  on public.event_trigger_events (user_id);

grant select, insert, delete on public.event_triggers to app_rls;
grant update (
  name, event_types, conditions, debounce_seconds, max_attempts, is_enabled, updated_at
) on public.event_triggers to app_rls;
grant select on public.event_trigger_events to app_rls;

alter table public.event_triggers enable row level security;
alter table public.event_triggers force row level security;
alter table public.event_trigger_events enable row level security;
alter table public.event_trigger_events force row level security;

drop policy if exists event_triggers_owner_read on public.event_triggers;
create policy event_triggers_owner_read
  on public.event_triggers
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists event_triggers_owner_insert on public.event_triggers;
create policy event_triggers_owner_insert
  on public.event_triggers
  for insert to app_rls
  with check (
    public.app_row_is_writable(user_id, organization_id)
    and exists (
      select 1 from public.scheduled_tasks as task
       where task.id = event_triggers.task_id
         and task.user_id = event_triggers.user_id
    )
    and verified_at is null
    and (
      verification_status = 'pending'
      or source = any (array['github', 'connector'])
    )
  );

drop policy if exists event_triggers_owner_update on public.event_triggers;
create policy event_triggers_owner_update
  on public.event_triggers
  for update to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (public.app_row_is_writable(user_id, organization_id));

drop policy if exists event_triggers_owner_delete on public.event_triggers;
create policy event_triggers_owner_delete
  on public.event_triggers
  for delete to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists event_trigger_events_owner_read on public.event_trigger_events;
create policy event_trigger_events_owner_read
  on public.event_trigger_events
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

comment on table public.event_triggers is
  'Binds a provider event source to a scheduled task. Receivers verify, filter, debounce and enqueue; the background job fires the run.';
comment on column public.event_triggers.source_account is
  'Provider identity the trigger listens to: Gmail address, Slack team id or GitHub owner/name. Null for calendar and connector triggers, which are addressed by trigger id.';
comment on column public.event_triggers.verification_code_sha256 is
  'SHA-256 of the one-time code that proves ownership of a Slack workspace; cleared once verified.';
comment on table public.event_trigger_events is
  'Audit trail of every delivery a trigger considered and what happened to it, deduplicated on the provider delivery id.';

commit;
