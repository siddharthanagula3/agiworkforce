-- =============================================================================
-- Migration 0247: Study mode sessions
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Study mode is a way of working through a subject, not a second kind
--          of chat. The conversation, its messages, its model and its billing
--          all stay in `web_conversations` and `web_messages` exactly as they
--          are; what is missing is the small amount of state that makes a
--          conversation a study session and lets the user find it again: what
--          they are studying, how (learning it, practising it, revising it) and
--          at what level.
--
-- Reuse  : one row per conversation, and the conversation is the owner. A
--          deleted conversation takes its study session with it, so Study mode
--          adds nothing to erasure, retention or export that the conversation
--          did not already carry.
--
-- Ended  : `ended_at` records leaving study mode. The conversation survives and
--          stays readable in normal chat, which is what "exit" has to mean:
--          nothing a user wrote is thrown away by leaving a mode.
--
-- Level  : the same three levels the response-style preference uses
--          (apps/web/lib/preferences/response-style-preferences.ts), so a user
--          who has said they are a beginner is not asked again in a different
--          vocabulary.
--
-- Depends: 0001 (web_conversations), 0037 (current_app_user_id)
-- =============================================================================

begin;

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid not null unique references public.web_conversations(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  mode text not null check (mode in ('learn', 'practice', 'review')),
  level text not null check (level in ('beginner', 'intermediate', 'expert')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint study_sessions_ends_after_it_starts
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_study_sessions_user_started
  on public.study_sessions (user_id, started_at desc);

grant select, insert, update, delete on public.study_sessions to app_rls;

alter table public.study_sessions enable row level security;
alter table public.study_sessions force row level security;

drop policy if exists study_sessions_owner on public.study_sessions;
create policy study_sessions_owner
  on public.study_sessions for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.study_sessions is
  'Study mode state for one conversation. The conversation and its messages stay in web_conversations and web_messages; this row only says what is being studied, how and at what level.';
comment on column public.study_sessions.ended_at is
  'Set when the user leaves study mode. The conversation is untouched and stays readable in normal chat.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A conversation carries at most one study session:
-- --    INSERT INTO public.study_sessions (user_id, conversation_id, topic, mode, level)
-- --    VALUES ('user_1', '<conversation>', 'Linear algebra', 'learn', 'beginner');
-- --    Repeat the same INSERT. EXPECT: unique violation on conversation_id.
--
-- -- 2. Deleting the conversation takes the session with it:
-- --    DELETE FROM public.web_conversations WHERE id = '<conversation>';
-- --    SELECT count(*) FROM public.study_sessions WHERE conversation_id = '<conversation>';
-- --    EXPECT: 0
--
-- -- 3. An empty topic is refused:
-- --    INSERT ... topic = '   '  -- EXPECT: check violation.
--
-- -- 4. Another user cannot read the session:
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', 'user_2', true);
-- --    SELECT count(*) FROM public.study_sessions;  -- EXPECT: 0
