-- =============================================================================
-- Migration 0238: the record that lets a customer key version be retired
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : 0220 keeps a rotated key in `organization_encryption_keys.retired_keys`
--          so ciphertext sealed under it still opens. Nothing ever moved that
--          ciphertext onto the new key, and nothing stopped an operator from
--          dropping the old version out of the ring. Doing so makes every row
--          still sealed under it unreadable, permanently: the data key is gone
--          and the customer's KMS cannot help, because what is lost is our
--          wrapped copy, not their key.
--
--          This table is the evidence a retirement needs. One row per
--          (workspace, from version, to version) rewrap, carrying how much was
--          scanned, how much was resealed, how much is left and how many rows
--          refused to move.
--
-- Gate   : `complete` is not a label an operator can set on a run that still has
--          work in it. The check constraint below makes `state = 'complete'`
--          impossible while `remaining` or `failure_count` is above zero, so the
--          gate holds even against a hand-written UPDATE, not only against
--          `retireOrganizationKeyVersion` in
--          apps/web/lib/server/organization-encryption-keys.ts.
--
-- RLS    : same rule 0220 applies to the key association itself. Owners and
--          admins read their own workspace's runs, so a customer can see that
--          the move off their old key finished. Nothing writes through the
--          application role: a rewrap runs as the owner connection from an
--          audited service, and a progress figure the audited party can edit
--          proves nothing.
--
-- Depends: 0015 (organizations), 0037 (app_rls), 0220 (organization_encryption_keys)
-- =============================================================================

begin;

create table if not exists public.organization_key_rewrap_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  from_key_version text not null check (from_key_version ~ '^[A-Za-z0-9_-]{1,32}$'),
  to_key_version text not null check (to_key_version ~ '^[A-Za-z0-9_-]{1,32}$'),
  state text not null default 'pending'
    check (state in ('pending', 'running', 'complete', 'failed')),
  scanned integer not null default 0 check (scanned >= 0),
  resealed integer not null default 0 check (resealed >= 0),
  remaining integer not null default 0 check (remaining >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  started_by_user_id text not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint organization_key_rewrap_runs_versions_differ
    check (from_key_version <> to_key_version),
  constraint organization_key_rewrap_runs_completion_is_dated
    check ((state = 'complete') = (completed_at is not null)),
  constraint organization_key_rewrap_runs_complete_has_no_remainder
    check (state <> 'complete' or (remaining = 0 and failure_count = 0))
);

comment on table public.organization_key_rewrap_runs is
  'One rewrap of a workspace''s ciphertext from an old customer key version onto the current one. A version cannot be dropped from the ring without a complete run here, because dropping it makes anything still sealed under it unreadable forever.';
comment on column public.organization_key_rewrap_runs.remaining is
  'Rows still sealed under from_key_version at the end of the run, counted from the stores rather than inferred from scanned minus resealed.';
comment on column public.organization_key_rewrap_runs.state is
  'complete is gated by a check constraint, not by convention: a run with anything remaining or any failure cannot claim it.';

create unique index if not exists organization_key_rewrap_runs_pair_idx
  on public.organization_key_rewrap_runs (organization_id, from_key_version, to_key_version);

create index if not exists organization_key_rewrap_runs_open_idx
  on public.organization_key_rewrap_runs (organization_id, state)
  where state in ('pending', 'running');

drop trigger if exists set_organization_key_rewrap_runs_updated_at
  on public.organization_key_rewrap_runs;
create trigger set_organization_key_rewrap_runs_updated_at
  before update on public.organization_key_rewrap_runs
  for each row execute function public.set_row_updated_at();

grant select on public.organization_key_rewrap_runs to app_rls;

alter table public.organization_key_rewrap_runs enable row level security;
alter table public.organization_key_rewrap_runs force row level security;

drop policy if exists organization_key_rewrap_runs_admin_read
  on public.organization_key_rewrap_runs;
create policy organization_key_rewrap_runs_admin_read
  on public.organization_key_rewrap_runs
  for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_key_rewrap_runs.organization_id
         and m.user_id = public.current_app_user_id()
         and m.role in ('owner', 'admin')
    )
  );

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A run cannot claim completion while rows are still on the old key:
-- --    INSERT INTO public.organization_key_rewrap_runs
-- --      (organization_id, from_key_version, to_key_version, state, remaining,
-- --       started_by_user_id, completed_at)
-- --      VALUES ('<org>', '1', '2', 'complete', 7, 'u', now());
-- --    EXPECT: check violation (organization_key_rewrap_runs_complete_has_no_remainder).
--
-- -- 2. Nor while a row refused to move:
-- --    Same INSERT with remaining = 0, failure_count = 1.
-- --    EXPECT: check violation (same constraint).
--
-- -- 3. A rewrap onto itself is not a rewrap:
-- --    Same INSERT with from_key_version = to_key_version = '1'.
-- --    EXPECT: check violation (organization_key_rewrap_runs_versions_differ).
--
-- -- 4. A plain member reads no run:
-- --    SET ROLE app_rls;
-- --    SELECT set_config('app.user_id', '<member user id>', true);
-- --    SELECT count(*) FROM public.organization_key_rewrap_runs;
-- --    EXPECT: 0.
--
-- -- 5. The application role cannot write one:
-- --    SET ROLE app_rls;
-- --    UPDATE public.organization_key_rewrap_runs SET state = 'complete';
-- --    EXPECT: permission denied (no UPDATE grant).
