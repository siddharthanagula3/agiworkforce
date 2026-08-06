-- =============================================================================
-- Migration: 0089_support_live_handoff.sql
-- Purpose  : SUPPORT-HANDOFF-01 — presence, escalation sessions, and live
--            messages for "talk to a human" in the support widget.
--
-- MIGRATION NUMBER: 0087 is taken by the concurrent enterprise-audit work and
-- 0088 is claimed by the concurrent support-actions work, so this takes 0089.
-- Nothing in application code references the number; only the sibling
-- `support-live-handoff-migration.test.ts` path constant does.
--
-- -----------------------------------------------------------------------------
-- THE PROPERTY THIS SCHEMA ENFORCES
-- -----------------------------------------------------------------------------
-- A widget that says "connecting you to an agent" and never connects is the most
-- damaging pattern in support. The status vocabulary below therefore has NO
-- `connecting` value, and `support_handoff_waiting_has_deadline` makes an
-- indefinite waiting state *unstorable*: a row may only be `waiting` if it also
-- carries a `wait_expires_at`. Application code cannot regress past this, and a
-- future edit that drops the CHECK fails the migration test.
--
-- -----------------------------------------------------------------------------
-- ACCESS MODEL — read this before adding an RLS block
-- -----------------------------------------------------------------------------
-- These three tables are SERVICE-CONTEXT ONLY. Every reader and writer goes
-- through `apps/web/lib/support/handoff/store.ts` via `getNeonDb()` (the
-- unscoped adapter), and every user-facing statement in that module carries an
-- explicit `owner_session_key = $n` predicate. That predicate is the primary and
-- sufficient gate.
--
-- No privileges are granted to `app_rls`, which is deny-by-default here: this
-- database has no `alter default privileges` and no blanket
-- `grant ... on all tables in schema public`, so a table created by this
-- migration is unreachable from a user-context adapter unless someone grants it
-- explicitly. The `revoke` statements below make that intent executable rather
-- than incidental.
--
-- RLS is deliberately NOT enabled, following the precedent of
-- 0080_device_refresh_token_rotation.sql (also service-context-only). Enabling
-- `force row level security` with no policy would block the owner role the
-- application actually connects as and take support offline, and a
-- `with check (true)` policy would be theatre. Anonymous marketing escalations
-- additionally have no `request.jwt.claim` for a policy to match on.
--
-- !! NEVER issue `grant ... on all tables in schema public to app_rls` — it
-- !! would silently hand a user-context adapter direct access to every support
-- !! transcript in the table (and undo the append-only guarantees 0043 and 0087
-- !! established elsewhere) with no failing test.
--
-- -----------------------------------------------------------------------------
-- RETENTION
-- -----------------------------------------------------------------------------
-- `transcript` holds user conversation content (secret-redacted before write by
-- lib/support/handoff/transcript.ts, but still user content). The cron at
-- /api/cron/expire-support-handoffs deletes rows older than
-- AGI_SUPPORT_HANDOFF_RETENTION_DAYS (default 90). Account deletion must also
-- cover these rows — tracked as a follow-up, see the workstream report.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Human agent roster + liveness
-- -----------------------------------------------------------------------------
-- A row exists only for a human an admin deliberately onboarded. `status` alone
-- is NOT trusted: presence resolution also requires `last_heartbeat_at` inside
-- the configured TTL, because an agent who closes the tab or loses wifi never
-- gets to write 'offline'.
create table if not exists public.support_agent_presence (
  agent_user_id           text primary key,
  display_name            text not null,
  status                  text not null default 'offline'
                            check (status in ('online', 'offline')),
  max_concurrent_sessions int not null default 3
                            check (max_concurrent_sessions between 0 and 50),
  last_heartbeat_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.support_agent_presence is
  'Explicitly onboarded human support agents. Availability requires status=online AND a fresh last_heartbeat_at; default is unavailable.';
comment on column public.support_agent_presence.display_name is
  'First name only. Surfaced to end users; never an email address or user id.';
comment on column public.support_agent_presence.last_heartbeat_at is
  'Liveness. A stale heartbeat decays the agent to unavailable with no action required.';

-- -----------------------------------------------------------------------------
-- 2. Escalation sessions
-- -----------------------------------------------------------------------------
create table if not exists public.support_handoff_sessions (
  id                        uuid primary key default gen_random_uuid(),
  reference_id              text not null unique,
  -- null when the escalation was raised signed out (marketing widget).
  owner_user_id             text,
  -- Clerk user id when signed in, else the __Host-anon-session-id value.
  -- This is the ownership key; it is never supplied by the client.
  owner_session_key         text not null,
  surface                   text not null
                              check (surface in ('web-app', 'marketing')),
  reason                    text not null
                              check (reason in ('user_requested', 'hard_abstain', 'low_confidence',
                                                'no_citation', 'action_refused')),
  -- NOTE: no 'connecting'. See the header.
  status                    text not null
                              check (status in ('waiting', 'connected', 'closed', 'emailed',
                                                'timed_out_emailed', 'cancelled', 'undeliverable')),
  contact_email             text not null,
  summary                   text not null,
  transcript                jsonb not null,
  attempted_actions         jsonb not null default '[]'::jsonb,
  citations                 jsonb not null default '[]'::jsonb,
  -- SERVER-derived only (plan, status, usage percentages). Never client-supplied,
  -- and never private allowance operands.
  account_context           jsonb not null default '{}'::jsonb,
  page_path                 text,
  locale                    text,
  agent_user_id             text references public.support_agent_presence(agent_user_id),
  wait_expires_at           timestamptz,
  connected_at              timestamptz,
  last_activity_at          timestamptz not null default now(),
  closed_at                 timestamptz,
  email_sent_at             timestamptz,
  email_provider_message_id text,
  email_error               text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- THE load-bearing constraint: a waiting session without a deadline is
  -- exactly the bug this feature exists to prevent, so it cannot be stored.
  constraint support_handoff_waiting_has_deadline
    check (status <> 'waiting' or wait_expires_at is not null)
);

comment on table public.support_handoff_sessions is
  'One support escalation. Holds redacted transcript + server-derived account context so a human never makes the user repeat themselves.';
comment on constraint support_handoff_waiting_has_deadline on public.support_handoff_sessions is
  'A waiting handoff must carry an expiry. Prevents an indefinite "connecting you to an agent" state at the storage layer.';

-- Cron sweep of expired waits.
create index if not exists idx_support_handoff_waiting
  on public.support_handoff_sessions (wait_expires_at)
  where status = 'waiting';

-- Ownership-scoped reads.
create index if not exists idx_support_handoff_owner
  on public.support_handoff_sessions (owner_session_key, created_at desc);

-- Idle-connected sweep.
create index if not exists idx_support_handoff_connected_idle
  on public.support_handoff_sessions (last_activity_at)
  where status = 'connected';

-- Retention purge.
create index if not exists idx_support_handoff_retention
  on public.support_handoff_sessions (created_at);

-- Agent load (capacity gate).
create index if not exists idx_support_handoff_agent_active
  on public.support_handoff_sessions (agent_user_id)
  where status = 'connected';

-- -----------------------------------------------------------------------------
-- 3. Live messages
-- -----------------------------------------------------------------------------
-- Polling, not sockets: this deployment is Vercel serverless and cannot hold a
-- connection open. `seq` is a per-session monotonic cursor allocated server-side;
-- both sides poll `?after=<seq>`. The unique constraint is what makes a
-- concurrent allocation fail loudly instead of duplicating a cursor.
create table if not exists public.support_handoff_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.support_handoff_sessions(id) on delete cascade,
  seq        bigint not null,
  author     text not null check (author in ('user', 'agent', 'system')),
  body       text not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists idx_support_handoff_messages_cursor
  on public.support_handoff_messages (session_id, seq);

-- -----------------------------------------------------------------------------
-- 4. Deny-by-default for the user-context role
-- -----------------------------------------------------------------------------
revoke all on public.support_agent_presence from app_rls;
revoke all on public.support_handoff_sessions from app_rls;
revoke all on public.support_handoff_messages from app_rls;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before applying to
-- production. Vitest cannot prove any of this: every DB test in apps/web mocks
-- the adapter, so a green suite says nothing about role behaviour or constraint
-- enforcement here. (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. An indefinite waiting state is unstorable:
-- --    insert into public.support_handoff_sessions
-- --      (reference_id, owner_session_key, surface, reason, status, contact_email, summary, transcript)
-- --      values ('AGI-20260805-TESTTEST', 'anon-x', 'marketing', 'user_requested', 'waiting',
-- --              'a@b.com', 's', '[]'::jsonb);
-- --    EXPECT: ERROR new row violates check constraint "support_handoff_waiting_has_deadline".
--
-- -- 2. The same insert WITH a deadline succeeds:
-- --    ... , wait_expires_at) values (..., now() + interval '2 minutes');
-- --    EXPECT: 1 row.
--
-- -- 3. There is no 'connecting' status:
-- --    update public.support_handoff_sessions set status = 'connecting';
-- --    EXPECT: ERROR violates check constraint.
--
-- -- 4. app_rls cannot read support transcripts:
-- --    set role app_rls;
-- --    select count(*) from public.support_handoff_sessions;
-- --    EXPECT: ERROR permission denied for table support_handoff_sessions.
--
-- -- 5. The single-flight timeout transition really is single-flight. In two
-- --    concurrent sessions against the SAME expired waiting row run:
-- --      update public.support_handoff_sessions
-- --         set status = 'timed_out_emailed'
-- --       where id = '<id>' and status = 'waiting' and wait_expires_at <= now()
-- --      returning id;
-- --    EXPECT: exactly one session returns a row; the other returns zero.
--
-- -- 6. Message cursors cannot duplicate:
-- --    insert into public.support_handoff_messages (session_id, seq, author, body)
-- --      values ('<id>', 1, 'user', 'a'), ('<id>', 1, 'agent', 'b');
-- --    EXPECT: ERROR duplicate key value violates unique constraint.
-- =============================================================================
