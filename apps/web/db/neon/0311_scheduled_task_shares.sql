-- =============================================================================
-- Migration 0311: share a schedule as a copy others can start from
--
-- Why    : Share on a schedule only copied a link to the sharer's own
--          Schedules page, so a recipient got nothing they could use. A share
--          is now a snapshot link, the way ChatGPT shares a conversation: the
--          schedule's name, instructions and cadence as they were when shared,
--          readable by anyone with the link, which the recipient turns into a
--          schedule of their own.
--
-- Shape  : one row per share. snapshot is the copyable part of the schedule
--          and never its run history, results, project, connectors or
--          condition. Sharing a schedule again refreshes its live link rather
--          than minting another, so a schedule has at most one unrevoked
--          share. Revoking sets revoked_at and the link stops resolving.
--          Deleting the schedule keeps the share until its owner revokes it,
--          as a shared conversation outlives the conversation. visibility is
--          always public: the token is the whole audience.
--
-- Depends: 0009 (scheduled_tasks), 0037 (profiles, current_app_user_id), 0076 (set_row_updated_at),
--          0278 (assign_cloud_sync_version)
-- =============================================================================

begin;

create table if not exists public.scheduled_task_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  user_id text not null references public.profiles(id) on delete cascade,
  task_id uuid references public.scheduled_tasks(id) on delete set null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  visibility text not null default 'public' check (visibility = 'public'),
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  server_version bigint not null default 0
);

drop trigger if exists set_scheduled_task_shares_updated_at on public.scheduled_task_shares;
create trigger set_scheduled_task_shares_updated_at
  before update on public.scheduled_task_shares
  for each row execute function public.set_row_updated_at();

drop trigger if exists scheduled_task_shares_assign_version on public.scheduled_task_shares;
create trigger scheduled_task_shares_assign_version
  before insert or update on public.scheduled_task_shares
  for each row execute function public.assign_cloud_sync_version();

create unique index if not exists scheduled_task_shares_live_task_idx
  on public.scheduled_task_shares (task_id)
  where revoked_at is null and task_id is not null;

create index if not exists scheduled_task_shares_user_idx
  on public.scheduled_task_shares (user_id, created_at desc);

revoke all on public.scheduled_task_shares from app_rls;
grant select, insert, update on public.scheduled_task_shares to app_rls;

alter table public.scheduled_task_shares enable row level security;
alter table public.scheduled_task_shares force row level security;

drop policy if exists scheduled_task_shares_owner on public.scheduled_task_shares;
create policy scheduled_task_shares_owner
  on public.scheduled_task_shares for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.scheduled_task_shares is
  'Snapshot links to a schedule. Anyone with an unrevoked token can read the snapshot and create their own schedule from it; the owner reads, refreshes and revokes their shares.';

commit;
