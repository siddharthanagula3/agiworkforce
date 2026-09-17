-- 0223 : the outcome of every connector tool call, so a connector can say what
--        it did and whether the provider behind it is answering.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Two things a connected account could not answer before this table. The first
-- is what the agent actually did with the grant: recordAuditEvent covers connect
-- and disconnect, and 0221 meters a call as a cost row, but neither says which
-- tool ran, when, or whether it worked, so the only record of a connector acting
-- on someone's mailbox was the conversation that asked for it.
--
-- The second is health. resolveConnectorHealth answered from configuration
-- alone: authorized or not, available here or not. A connector whose provider
-- is refusing every request reads 'connected' under that model, so the surface
-- told the reader a mailbox was working while every call to it failed.
--
-- outcome is what the executor returned, not a guess at why:
--   succeeded  the tool answered and the result was not an error
--   failed     the tool answered with an error, or threw
--   blocked    outbound content inspection refused the arguments before the
--              call left this system, which is this platform's own decision and
--              must never count against the provider's health
--
-- Health derives from the recent run of outcomes for one connector, never from
-- a parsed error string: a connector that has failed its last several calls is
-- reported as not responding, which is what a reader can act on, and does not
-- claim a cause this table cannot know.
--
-- Erasure: user_id cascades from profiles, and account-erasure names the table
-- so the export inventory has to answer for it.

create table if not exists public.connector_call_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  connector_id text not null check (char_length(connector_id) between 1 and 128),
  tool_name text not null check (char_length(tool_name) between 1 and 128),
  outcome text not null
    check (outcome = any (array['succeeded', 'failed', 'blocked'])),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  surface text check (surface is null or char_length(surface) <= 32),
  occurred_at timestamptz not null default now()
);

create index if not exists idx_connector_call_events_user_occurred
  on public.connector_call_events (user_id, occurred_at desc);

create index if not exists idx_connector_call_events_health
  on public.connector_call_events (user_id, connector_id, occurred_at desc);

create index if not exists idx_connector_call_events_organization
  on public.connector_call_events (organization_id, occurred_at desc)
  where organization_id is not null;

grant select, insert, delete on public.connector_call_events to app_rls;

alter table public.connector_call_events enable row level security;
alter table public.connector_call_events force row level security;

drop policy if exists connector_call_events_user_isolation on public.connector_call_events;
create policy connector_call_events_user_isolation
  on public.connector_call_events
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.connector_call_events is
  'One row per connector tool call: which tool, when, and how it ended. Feeds the per-connector activity log and the not-responding health state. app_rls sees only the signed-in account''s own rows.';
comment on column public.connector_call_events.outcome is
  'succeeded and failed are the provider''s answer. blocked is this platform refusing the arguments before the call left, so it never counts against provider health.';

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The table exists with row-level security forced:
-- --    SELECT relrowsecurity, relforcerowsecurity FROM pg_class
-- --      WHERE oid = 'public.connector_call_events'::regclass;
-- --    EXPECT: t | t
--
-- -- 2. An unknown outcome is refused:
-- --    INSERT INTO public.connector_call_events (user_id, connector_id, tool_name, outcome)
-- --    VALUES ('<an existing profiles.id>', 'gmail', 'send', 'maybe');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. app_rls cannot read another account's rows:
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', '<other user>', true);
-- --    SELECT count(*) FROM public.connector_call_events WHERE user_id = '<first user>';
-- --    EXPECT: 0
--
-- -- 4. Clean up:
-- --    DELETE FROM public.connector_call_events WHERE connector_id = 'gmail';
-- =============================================================================
