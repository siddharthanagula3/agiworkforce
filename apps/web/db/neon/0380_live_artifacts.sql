-- =============================================================================
-- Migration 0380: live artifacts
--
-- Why    : an artifact that reads the owner's connected apps had nowhere to
--          keep the owner's permission to do so, so it could not refresh with
--          current data when reopened and could not be listed across chats.
--
-- Shape  : live_artifacts holds one row per artifact its owner made live. A
--          row is the owner's saved connector binding: the connected apps the
--          artifact may read, the tools the owner allowed, and when it
--          refreshes. The artifact itself stays in the message that produced
--          it (web_artifact_index, 0121); artifact_id is that index's derived
--          id and is deliberately not a foreign key, because re-indexing a
--          message deletes and re-inserts its index rows. The row goes when its
--          conversation or message goes.
--          readiness, missing_connectors, next_check_at and check_failures
--          belong to the refresh worker, which re-checks each binding's
--          connected apps on a backoff so the list can say which artifact
--          needs a connection before it is opened.
--
-- Depends: 0001_mvp_chat (web_conversations, web_messages), 0037_rls_user_isolation
--          (current_app_user_id, app_rls role), 0076 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.live_artifacts (
  user_id text not null,
  artifact_id uuid not null,
  conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  message_id uuid not null references public.web_messages(id) on delete cascade,
  connectors text[] not null check (cardinality(connectors) between 1 and 10),
  allowed_tools text[] not null default '{}' check (cardinality(allowed_tools) <= 200),
  refresh_policy text not null default 'on_open' check (refresh_policy in ('on_open', 'manual')),
  last_refreshed_at timestamptz,
  readiness text not null default 'ready' check (readiness in ('ready', 'needs_connection')),
  missing_connectors text[] not null default '{}',
  check_failures integer not null default 0 check (check_failures >= 0),
  next_check_at timestamptz not null default now(),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, artifact_id)
);

comment on table public.live_artifacts is
  'Artifacts their owner made live: the saved connector binding, refresh policy and the refresh worker''s readiness check.';

create index if not exists idx_live_artifacts_user_recent
  on public.live_artifacts(user_id, updated_at desc);
create index if not exists idx_live_artifacts_due
  on public.live_artifacts(next_check_at);
create index if not exists idx_live_artifacts_message
  on public.live_artifacts(message_id);

drop trigger if exists set_live_artifacts_updated_at on public.live_artifacts;
create trigger set_live_artifacts_updated_at
  before update on public.live_artifacts
  for each row execute function public.set_row_updated_at();

alter table public.live_artifacts enable row level security;
alter table public.live_artifacts force row level security;

revoke all on public.live_artifacts from public;
grant select, insert, update, delete on public.live_artifacts to app_rls;

drop policy if exists live_artifacts_user_isolation on public.live_artifacts;
create policy live_artifacts_user_isolation
  on public.live_artifacts
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

commit;
