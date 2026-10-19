-- =============================================================================
-- Migration 0369: comments on artifacts
--
-- Why    : documents, decks and designs in the artifact panel had no way to
--          leave a note on a passage, a slide or an element and come back to
--          it, or to hand a batch of notes to the assistant as edit requests.
--
-- Shape  : artifact_comments holds one comment or reply. artifact_id is the
--          client artifact id the chat sync already uses (0121), with no
--          foreign key because an artifact can exist on the device before it
--          syncs. anchor says where the comment points: a quoted passage with
--          its surrounding text, a slide number, or an element path and point
--          on a rendered design. Replies point at their thread through
--          parent_id and go with it. author separates the person's comments
--          from replies the assistant wrote. Rows belong to the account that
--          wrote them and RLS keeps every other account out.
--
-- Depends: 0037_rls_user_isolation (current_app_user_id, app_rls role)
-- =============================================================================

begin;

create table if not exists public.artifact_comments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  artifact_id uuid not null,
  parent_id uuid references public.artifact_comments(id) on delete cascade,
  anchor jsonb not null default '{}'::jsonb check (jsonb_typeof(anchor) = 'object'),
  body text not null check (char_length(body) between 1 and 4000),
  author text not null default 'user' check (author in ('user', 'assistant')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_artifact_comments_user_artifact
  on public.artifact_comments(user_id, artifact_id, created_at);
create index if not exists idx_artifact_comments_parent
  on public.artifact_comments(parent_id);

alter table public.artifact_comments enable row level security;
alter table public.artifact_comments force row level security;
drop policy if exists artifact_comments_user_isolation on public.artifact_comments;
create policy artifact_comments_user_isolation
  on public.artifact_comments for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

commit;
