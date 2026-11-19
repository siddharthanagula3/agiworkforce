-- =============================================================================
-- Migration 0405: a stored, retryable sign-in provider step for operator
--                 account actions
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Banning or reactivating an account changes its status here and then
--          asks the sign-in provider to match. When the provider call failed,
--          the operator saw a partial result and had to resubmit; nothing kept
--          the unfinished step, so a reactivated customer stayed locked out of
--          sign-in, or a banned one stayed able to sign in to the provider,
--          until someone noticed.
--
-- Shape  : One row per operator suspend, ban or reactivation. account_status
--          is the status written here; provider_suspended is what the provider
--          must be told (null when the action has no provider step, which is
--          what provider_status 'not_required' means). A failed step is
--          retried by the background job queue until it completes, the job
--          gives up, or a later action on the same account supersedes it. A
--          retry never runs against a status the account no longer has.
--
-- Access : platform operators only, through the service connection. RLS is on
--          with no policy and app_rls holds no privilege, so no signed-in
--          account can read or write a row, including its own.
--
-- Empty  : new table; nothing to backfill. Actions taken before this
--          migration have no row and are retried only by resubmitting.
--
-- Depends: 0020 (profiles.account_status), 0037 (app_rls), 0076
--          (set_row_updated_at), 0208 (background_jobs)
-- =============================================================================

begin;

create table if not exists public.admin_account_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('suspend-user', 'ban-user', 'reactivate-user')),
  account_status text not null check (account_status in ('active', 'suspended', 'banned')),
  provider_suspended boolean,
  provider_status text not null
    check (provider_status in ('not_required', 'pending', 'completed', 'failed', 'superseded')),
  provider_attempts integer not null default 0 check (provider_attempts >= 0),
  provider_error text check (provider_error is null or char_length(provider_error) <= 500),
  provider_completed_at timestamptz,
  requested_by_user_id text not null check (char_length(requested_by_user_id) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_account_actions_provider_step check (
    (provider_suspended is null) = (provider_status = 'not_required')
  ),
  constraint admin_account_actions_completion_is_dated check (
    (provider_status = 'completed') = (provider_completed_at is not null)
  )
);

comment on table public.admin_account_actions is
  'One row per operator suspend, ban or reactivation, carrying the sign-in provider step until it completes or a later action supersedes it. Service connection only.';
comment on column public.admin_account_actions.provider_suspended is
  'What the sign-in provider must be told: true to block sign-in, false to allow it. Null when the action has no provider step.';
comment on column public.admin_account_actions.provider_status is
  'not_required, pending (not yet attempted), completed, failed (retried by the background job queue) or superseded (a later action on the account replaced it).';

create index if not exists idx_admin_account_actions_user
  on public.admin_account_actions (user_id, created_at desc);

create index if not exists idx_admin_account_actions_unfinished
  on public.admin_account_actions (created_at)
  where provider_status in ('pending', 'failed');

drop trigger if exists set_admin_account_actions_updated_at on public.admin_account_actions;
create trigger set_admin_account_actions_updated_at
  before update on public.admin_account_actions
  for each row execute function public.set_row_updated_at();

alter table public.admin_account_actions enable row level security;
alter table public.admin_account_actions force row level security;
revoke all on public.admin_account_actions from public;
revoke all on public.admin_account_actions from app_rls;

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A provider step cannot be recorded without saying what to tell it:
-- --    insert into public.admin_account_actions
-- --      (user_id, action, account_status, provider_status, requested_by_user_id)
-- --    values ('<a profile id>', 'ban-user', 'banned', 'pending', 'op');
-- --    EXPECT: check violation (admin_account_actions_provider_step).
--
-- -- 2. A completed step is dated:
-- --    update public.admin_account_actions set provider_status = 'completed'
-- --     where provider_completed_at is null and provider_status = 'failed';
-- --    EXPECT: check violation (admin_account_actions_completion_is_dated).
--
-- -- 3. The application role sees nothing:
-- --    set role app_rls; select count(*) from public.admin_account_actions;
-- --    EXPECT: permission denied.
