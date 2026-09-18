-- =============================================================================
-- Migration 0260: the canonical VoiceSession record
--
-- Why    : a live voice session existed only as the provider's session id held
--          in a browser tab. The voice, the language and the speaking pace were
--          in that tab's localStorage, so nothing recorded what a session was
--          actually configured with, a reconnect started from scratch, and a
--          second device could not resume or even see the session. There was no
--          cross-surface entity either: web, mobile and desktop each invented
--          their own per-request object.
--
-- Shape  : one row per voice session, bound to exactly one conversation. The
--          settings are columns rather than a blob because they are read back
--          to resume a session and audited after it: voice, language (NULL is
--          automatic detection), pace as a rate multiplier. active_tools is the
--          tool id list the delegation was offered, and last_turn_id is the
--          transcript pointer a resuming client continues from.
--
-- Empty  : starts empty. A conversation with no row has never had a voice
--          session, which is what every existing conversation is.
--
-- Depends: 0001 (web_conversations), 0037 (profiles, current_app_user_id)
-- =============================================================================

begin;

create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid,
  conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  provider_session_id text not null check (char_length(provider_session_id) between 1 and 200),
  model_id text not null check (char_length(model_id) between 1 and 200),
  surface text not null check (surface in ('web', 'mobile', 'desktop')),
  voice text not null check (char_length(voice) between 1 and 64),
  language text check (language is null or char_length(language) between 2 and 32),
  pace numeric(3, 2) not null default 1.00 check (pace between 0.25 and 4.00),
  active_tools jsonb not null default '[]'::jsonb,
  last_turn_id text check (last_turn_id is null or char_length(last_turn_id) <= 128),
  status text not null default 'active' check (status in ('active', 'closed')),
  close_reason text check (close_reason is null or char_length(close_reason) <= 64),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint voice_sessions_closed_has_a_time
    check ((status = 'closed') = (closed_at is not null)),
  constraint voice_sessions_closes_after_it_starts
    check (closed_at is null or closed_at >= started_at)
);

create unique index if not exists idx_voice_sessions_provider_session
  on public.voice_sessions (provider, provider_session_id);

-- The resume lookup: one conversation has at most one session still open.
create unique index if not exists idx_voice_sessions_open_per_conversation
  on public.voice_sessions (conversation_id)
  where status = 'active';

create index if not exists idx_voice_sessions_user_started
  on public.voice_sessions (user_id, started_at desc);

grant select, insert, update on public.voice_sessions to app_rls;

alter table public.voice_sessions enable row level security;
alter table public.voice_sessions force row level security;

drop policy if exists voice_sessions_owner on public.voice_sessions;
create policy voice_sessions_owner
  on public.voice_sessions for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.voice_sessions is
  'One row per live voice session, bound to exactly one conversation. Carries the voice, language and pace the session ran with, the tools its delegation was offered, and the transcript turn a reconnecting client resumes from.';
comment on column public.voice_sessions.language is
  'BCP-47 tag the session negotiated. NULL means the provider detects the language.';
comment on column public.voice_sessions.pace is
  'Speaking rate multiplier applied to the live session, 1.00 being the provider default.';
comment on column public.voice_sessions.last_turn_id is
  'The last transcript turn delivered to a client. A second device resumes after it.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A second open session on one conversation is refused:
-- --    INSERT INTO public.voice_sessions
-- --      (user_id, conversation_id, provider, provider_session_id, model_id, surface, voice)
-- --    VALUES ('<user>', '<conversation>', 'openai', 'sess_a', '<model>', 'web', 'alloy');
-- --    INSERT INTO public.voice_sessions
-- --      (user_id, conversation_id, provider, provider_session_id, model_id, surface, voice)
-- --    VALUES ('<user>', '<conversation>', 'openai', 'sess_b', '<model>', 'web', 'alloy');
-- --    EXPECT: ERROR duplicate key value violates idx_voice_sessions_open_per_conversation
--
-- -- 2. Closing frees the conversation for the next session:
-- --    UPDATE public.voice_sessions SET status = 'closed', closed_at = now()
-- --     WHERE provider_session_id = 'sess_a';
-- --    EXPECT: UPDATE 1, and the sess_b insert above now succeeds
--
-- -- 3. A closed row without a time is refused:
-- --    UPDATE public.voice_sessions SET status = 'closed' WHERE provider_session_id = 'sess_b';
-- --    EXPECT: ERROR new row violates check constraint "voice_sessions_closed_has_a_time"
--
-- -- 4. Another tenant sees nothing:
-- --    SET ROLE app_rls;
-- --    SELECT count(*) FROM public.voice_sessions;
-- --    EXPECT: 0 for a session variable set to a different user
-- --    RESET ROLE;
--
-- -- 5. Clean up:
-- --    DELETE FROM public.voice_sessions WHERE provider_session_id IN ('sess_a', 'sess_b');
-- =============================================================================
